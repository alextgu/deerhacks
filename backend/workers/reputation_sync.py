"""
Reputation Sync Worker: Solana → Supabase → Snowflake
=====================================================
Polls UserIdentity PDA accounts on Solana for penalize_abandonment changes.
When a user's abandonment_count changes:
  1. Update profiles.abandonment_count in Supabase.
  2. If count >= 3 (flagged on-chain), set is_flagged=true in Snowflake
     to remove them from the active match pool.

Usage:
    cd backend
    python -m workers.reputation_sync

Requires env vars:
    SOLANA_RPC_URL          (default: https://api.devnet.solana.com)
    SOLANA_PROGRAM_ID       (default: CEEGzYZPhBMWV49o1PCR8N7Y6CTuSjQs9sM7AFs4afgW)
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_PASSWORD,
    SNOWFLAKE_WAREHOUSE, SNOWFLAKE_DATABASE, SNOWFLAKE_SCHEMA
"""

import os
import sys
import time
import json
import struct
import logging
import base64
from typing import Optional

import requests
import snowflake.connector
from supabase import create_client, Client as SupabaseClient
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("reputation_sync")

PROGRAM_ID = os.environ.get(
    "SOLANA_PROGRAM_ID",
    "CEEGzYZPhBMWV49o1PCR8N7Y6CTuSjQs9sM7AFs4afgW",
)
RPC_URL = os.environ.get("SOLANA_RPC_URL", "https://api.devnet.solana.com")

ABANDONMENT_FLAG_THRESHOLD = 3
POLL_INTERVAL_SECONDS = int(os.environ.get("REPUTATION_POLL_INTERVAL", "15"))

IDENTITY_DISCRIMINATOR = None


# ── Supabase ─────────────────────────────────────────────────────────────────

def _get_supabase() -> SupabaseClient:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def update_supabase_abandonment(
    supabase: SupabaseClient, auth0_id: str, count: int, is_flagged: bool
) -> None:
    data = {"abandonment_count": count}
    if is_flagged:
        data["is_flagged"] = True
    supabase.table("profiles").update(data).eq("id", auth0_id).execute()
    logger.info("Supabase updated: %s → abandonment_count=%d flagged=%s", auth0_id, count, is_flagged)


# ── Snowflake ────────────────────────────────────────────────────────────────

def _get_snowflake_connection():
    return snowflake.connector.connect(
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        user=os.environ["SNOWFLAKE_USER"],
        password=os.environ["SNOWFLAKE_PASSWORD"],
        warehouse=os.environ.get("SNOWFLAKE_WAREHOUSE", "MIRROR_WH"),
        database=os.environ.get("SNOWFLAKE_DATABASE", "MIRROR"),
        schema=os.environ.get("SNOWFLAKE_SCHEMA", "MATCHING"),
        role=os.environ.get("SNOWFLAKE_ROLE", "MIRROR_APP_ROLE"),
    )


def update_user_flag(auth0_id: str, flagged: bool) -> None:
    """Set is_flagged on the user's Snowflake user_archetypes row(s)."""
    conn = _get_snowflake_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE USER_ARCHETYPES
            SET is_flagged  = %(flag)s,
                status      = CASE WHEN %(flag)s THEN 'flagged' ELSE 'active' END,
                updated_at  = CURRENT_TIMESTAMP()
            WHERE auth0_id = %(uid)s
            """,
            {"uid": auth0_id, "flag": flagged},
        )
        conn.commit()
        logger.info("Snowflake flagged: %s → is_flagged=%s", auth0_id, flagged)
    finally:
        conn.close()


# ── Solana RPC helpers ───────────────────────────────────────────────────────

def rpc_call(method: str, params: list) -> dict:
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    resp = requests.post(RPC_URL, json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json()


def get_program_accounts() -> list[dict]:
    """
    Fetch all UserIdentity PDAs owned by our program.
    Returns list of {pubkey, data_bytes}.
    """
    result = rpc_call("getProgramAccounts", [
        PROGRAM_ID,
        {"encoding": "base64", "commitment": "confirmed"},
    ])
    if "error" in result:
        raise RuntimeError(f"RPC error: {result['error']}")
    accounts = []
    for entry in result.get("result", []):
        pubkey = entry["pubkey"]
        data_b64 = entry["account"]["data"][0]
        data = base64.b64decode(data_b64)
        accounts.append({"pubkey": pubkey, "data": data})
    return accounts


def parse_user_identity(data: bytes) -> Optional[dict]:
    """
    Parse a UserIdentity account from raw Borsh-serialized bytes.
    Layout (after 8-byte Anchor discriminator):
      authority: 32 bytes (Pubkey)
      archetype: 4-byte len + UTF-8
      skill_weights: 4-byte vec len + entries
      karma: u64
      endorsements: 4-byte vec len + entries
      abandonment_count: u8
      is_flagged: bool (u8)
      bump: u8
    """
    if len(data) < 8 + 32 + 4:
        return None

    offset = 8  # skip discriminator

    authority = base64.b16encode(data[offset:offset + 32]).decode().lower()
    offset += 32

    archetype_len = struct.unpack_from("<I", data, offset)[0]
    offset += 4
    if offset + archetype_len > len(data):
        return None
    archetype = data[offset:offset + archetype_len].decode("utf-8", errors="replace")
    offset += archetype_len

    # skip skill_weights vec
    if offset + 4 > len(data):
        return None
    sw_count = struct.unpack_from("<I", data, offset)[0]
    offset += 4
    for _ in range(sw_count):
        if offset + 4 > len(data):
            return None
        name_len = struct.unpack_from("<I", data, offset)[0]
        offset += 4 + name_len + 2  # name bytes + weight (u16)

    if offset + 8 > len(data):
        return None
    karma = struct.unpack_from("<Q", data, offset)[0]
    offset += 8

    # skip endorsements vec
    if offset + 4 > len(data):
        return None
    end_count = struct.unpack_from("<I", data, offset)[0]
    offset += 4
    for _ in range(end_count):
        offset += 32  # endorser pubkey
        if offset + 4 > len(data):
            return None
        skill_len = struct.unpack_from("<I", data, offset)[0]
        offset += 4 + skill_len

    if offset + 3 > len(data):
        return None
    abandonment_count = data[offset]
    offset += 1
    is_flagged = bool(data[offset])
    offset += 1
    bump = data[offset]

    return {
        "authority": authority,
        "archetype": archetype,
        "karma": karma,
        "abandonment_count": abandonment_count,
        "is_flagged": is_flagged,
        "bump": bump,
    }


# ── Wallet → Auth0 mapping ──────────────────────────────────────────────────

def resolve_auth0_id(supabase: SupabaseClient, wallet_pubkey: str) -> Optional[str]:
    """
    Look up the auth0_id (profiles.id) for a given Solana wallet address.
    Assumes profiles table has a `wallet_address` column.
    """
    resp = (
        supabase.table("profiles")
        .select("id")
        .eq("wallet_address", wallet_pubkey)
        .limit(1)
        .execute()
    )
    if resp.data and len(resp.data) > 0:
        return resp.data[0]["id"]
    return None


# ── Main loop ────────────────────────────────────────────────────────────────

def run_sync_loop():
    logger.info("Starting reputation sync worker (program=%s, rpc=%s)", PROGRAM_ID, RPC_URL)
    logger.info("Poll interval: %d seconds", POLL_INTERVAL_SECONDS)

    supabase = _get_supabase()
    previous_state: dict[str, dict] = {}

    while True:
        try:
            accounts = get_program_accounts()
            current_state: dict[str, dict] = {}

            for acct in accounts:
                identity = parse_user_identity(acct["data"])
                if identity is None:
                    continue

                pda = acct["pubkey"]
                current_state[pda] = identity
                prev = previous_state.get(pda)

                if prev is None:
                    continue

                prev_count = prev["abandonment_count"]
                new_count = identity["abandonment_count"]
                if new_count <= prev_count:
                    continue

                logger.info(
                    "PenalizeAbandonment detected: PDA=%s count %d→%d flagged=%s",
                    pda, prev_count, new_count, identity["is_flagged"],
                )

                wallet_hex = identity["authority"]
                auth0_id = resolve_auth0_id(supabase, wallet_hex)
                if not auth0_id:
                    logger.warning("No auth0_id found for wallet %s (PDA %s)", wallet_hex, pda)
                    continue

                update_supabase_abandonment(supabase, auth0_id, new_count, identity["is_flagged"])

                if new_count >= ABANDONMENT_FLAG_THRESHOLD:
                    update_user_flag(auth0_id, True)

            previous_state = current_state

        except KeyboardInterrupt:
            logger.info("Shutting down.")
            break
        except Exception:
            logger.exception("Error in sync loop, retrying in %d seconds", POLL_INTERVAL_SECONDS)

        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    run_sync_loop()

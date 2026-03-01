"""
Solana Soulbound Identity Minting
=================================
Calls the on-chain `initialize_user` instruction to mint a non-transferable
UserIdentity PDA containing the user's archetype_label and skill weights.

The UserIdentity PDA is derived as ["user-identity", wallet_pubkey] and
cannot be transferred — making it a soulbound identity token.

Requires env vars:
    SOLANA_RPC_URL            (default: https://api.devnet.solana.com)
    SOLANA_PROGRAM_ID         (default: CEEGzYZPhBMWV49o1PCR8N7Y6CTuSjQs9sM7AFs4afgW)
    SOLANA_BACKEND_KEYPAIR    Path to the backend authority keypair JSON file
"""

import os
import json
import struct
import logging
import hashlib
import base64
from typing import Optional

import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("solana_mint")

PROGRAM_ID = os.environ.get(
    "SOLANA_PROGRAM_ID",
    "CEEGzYZPhBMWV49o1PCR8N7Y6CTuSjQs9sM7AFs4afgW",
)
RPC_URL = os.environ.get("SOLANA_RPC_URL", "https://api.devnet.solana.com")

SYSTEM_PROGRAM = "11111111111111111111111111111111"

# Anchor discriminator for initialize_user: sha256("global:initialize_user")[:8]
INIT_USER_DISCRIMINATOR = hashlib.sha256(b"global:initialize_user").digest()[:8]


def _load_keypair(path: str) -> tuple[bytes, str]:
    """Load a Solana keypair JSON → (secret_key_64_bytes, pubkey_base58)."""
    try:
        from solders.keypair import Keypair as SoldersKeypair  # type: ignore
        with open(path) as f:
            secret = json.load(f)
        kp = SoldersKeypair.from_bytes(bytes(secret))
        return bytes(kp), str(kp.pubkey())
    except ImportError:
        raise ImportError(
            "solders is required for Solana signing. "
            "Install with: pip install solders"
        )


def _find_pda(seeds: list[bytes], program_id_bytes: bytes) -> tuple[bytes, int]:
    """Derive a PDA (Program Derived Address)."""
    try:
        from solders.pubkey import Pubkey as SoldersPubkey  # type: ignore
        program = SoldersPubkey.from_bytes(program_id_bytes)
        pda, bump = SoldersPubkey.find_program_address(seeds, program)
        return bytes(pda), bump
    except ImportError:
        raise ImportError("solders is required. Install with: pip install solders")


def _pubkey_from_base58(s: str) -> bytes:
    try:
        from solders.pubkey import Pubkey as SoldersPubkey  # type: ignore
        return bytes(SoldersPubkey.from_string(s))
    except ImportError:
        raise ImportError("solders is required. Install with: pip install solders")


def mint_soulbound_identity(
    user_wallet_pubkey: str,
    archetype_label: str,
    skill_weights: list[dict],
) -> Optional[str]:
    """
    Call initialize_user on-chain to create the soulbound UserIdentity PDA.

    Args:
        user_wallet_pubkey: The user's Solana wallet base58 address (they sign this tx client-side).
        archetype_label: e.g. "Analyzed Persona" (max 32 chars)
        skill_weights: [{"name": "creativity", "weight": 850}, ...]

    Returns:
        Transaction signature string, or None if the identity already exists.

    NOTE: In the current Anchor program, `initialize_user` requires the user's
    wallet to sign (as the payer + PDA authority). This function prepares the
    instruction data; the actual signing must happen on the frontend (wallet adapter).
    This function is provided as a reference for building the instruction payload.
    """
    archetype_label = archetype_label[:32]
    skills = skill_weights[:10]

    # Build Borsh-serialized instruction data
    data = bytearray(INIT_USER_DISCRIMINATOR)

    archetype_bytes = archetype_label.encode("utf-8")
    data += struct.pack("<I", len(archetype_bytes))
    data += archetype_bytes

    data += struct.pack("<I", len(skills))
    for sw in skills:
        name_bytes = sw["name"][:32].encode("utf-8")
        data += struct.pack("<I", len(name_bytes))
        data += name_bytes
        data += struct.pack("<H", min(int(sw.get("weight", 500)), 65535))

    return {
        "instruction_data_base64": base64.b64encode(bytes(data)).decode(),
        "program_id": PROGRAM_ID,
        "user_wallet": user_wallet_pubkey,
        "archetype": archetype_label,
        "skill_count": len(skills),
    }


def check_identity_exists(wallet_pubkey: str) -> bool:
    """Check if a UserIdentity PDA already exists for this wallet."""
    program_bytes = _pubkey_from_base58(PROGRAM_ID)
    wallet_bytes = _pubkey_from_base58(wallet_pubkey)
    pda_bytes, _bump = _find_pda([b"user-identity", wallet_bytes], program_bytes)

    try:
        from solders.pubkey import Pubkey as SoldersPubkey  # type: ignore
        pda_b58 = str(SoldersPubkey.from_bytes(pda_bytes))
    except ImportError:
        raise

    resp = requests.post(
        RPC_URL,
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getAccountInfo",
            "params": [pda_b58, {"encoding": "base64"}],
        },
        timeout=15,
    )
    result = resp.json()
    return result.get("result", {}).get("value") is not None

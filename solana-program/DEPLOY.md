# Solana program deploy and backend setup

## 1. Deploy program to devnet

From repo root:

```bash
# Get devnet SOL (if needed)
solana airdrop 2 --url devnet

# Deploy (from solana-program/)
cd solana-program
anchor deploy --provider.cluster devnet
```

After deploy, the program ID is in `Anchor.toml` and in the build output. Set in frontend:

- `NEXT_PUBLIC_SOLANA_PROGRAM_ID=<program-id>` (optional if using default)
- `NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com` (optional; default is devnet)

## 2. Backend authority for penalties

The backend must hold a keypair that is the only signer allowed to call `penalize_abandonment`.

1. Generate a keypair (or reuse the deployer):

   ```bash
   solana-keygen new -o authority.json --no-bip39-passphrase
   ```

2. Add to frontend `.env` (server-only; never commit the real value):

   ```env
   SOLANA_AUTHORITY_KEYPAIR=[1,2,3,...]
   ```

   Use the secret key array from `authority.json` (the 64-byte array as JSON).

3. One-time: initialize the program config with this authority:

   ```bash
   curl -X POST http://localhost:3000/api/solana/initialize-config \
     -H "Content-Type: application/json" \
     -d '{"authorityPubkey":"<PUBKEY_OF_authority.json>"}'
   ```

   Optionally protect with header `x-initialize-config-secret` and `SOLANA_INITIALIZE_CONFIG_SECRET` in env.

After that, when a match is abandoned, your backend (e.g. Snowflake or a cron job) should call:

```http
POST /api/solana/penalize-abandonment
Content-Type: application/json

{"userWallet":"<abandoning user's Solana wallet pubkey>"}
```

No database or frontend changes required for penalties; the API uses the authority keypair to sign the transaction.

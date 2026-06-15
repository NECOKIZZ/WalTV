# WalTube Fork Royalties (Move)

This is a **separate, additive** Move package for WalTube. It does not modify the existing `cuerate_attribution` contract. If this package breaks, the original attribution system continues to work.

## What It Does

When a user pays a creator via "paid likes" on a forked prompt, this contract **atomically splits** the SUI payment across the entire fork chain:

```
Tipper pays 0.001 SUI
  -> Original creator gets 5%  (50,000 MIST)
  -> Fork 1 creator gets 3%     (30,000 MIST)
  -> Fork 2 creator gets 2%     (20,000 MIST)
  -> Current creator gets 90%   (900,000 MIST)
```

All of this happens in **one transaction**. No frontend calculation. No trust.

## Objects

| Object | Type | Purpose |
|--------|------|---------|
| `RoyaltyRegistry` | Shared | Maps `prompt_key` -> `RoyaltyConfig` ID. Created once at deploy. |
| `RoyaltyConfig` | Shared (per prompt) | Holds recipient addresses and their share percentages (basis points). |

## Functions

### `create_registry(ctx)`
Call **once** after publishing the package. Creates the shared `RoyaltyRegistry`.

### `create_royalty_config(registry, prompt_key, recipients, shares_bps, ctx)`
Call after `record_fork` (or for the original prompt). The frontend/backend computes the fork chain and passes the ordered recipient list + shares.

**Shares must sum to exactly 10,000** (100%).

Example:
```
recipients = [0xAAA..., 0xBBB..., 0xCCC...]
shares_bps = [500, 300, 9200]   // 5%, 3%, 92%
```

### `receive_payment(config, payment, ctx)`
Anyone can call this. Pass a `RoyaltyConfig` and a `Coin<SUI>`. The contract splits the coin and distributes to all recipients automatically.

## Deployment Steps

1. Make sure you have the Sui CLI installed and are on the right network:
   ```bash
   sui client active-env
   # should say "testnet" or "mainnet"
   ```

2. Build the package:
   ```bash
   cd move/waltube_royalties
   sui move build
   ```

3. Publish to testnet (or mainnet):
   ```bash
   sui client publish --gas-budget 50000000
   ```

4. Note the **Package ID** from the output.

5. Call `create_registry` once:
   ```bash
   sui client call \
     --package <PACKAGE_ID> \
     --module royalties \
     --function create_registry \
     --gas-budget 10000000
   ```

6. Copy the Package ID into your `.env`:
   ```
   VITE_WALTUBE_ROYALTIES_PACKAGE_ID=<PACKAGE_ID>
   ```

7. Only after testing, set:
   ```
   VITE_ENABLE_FORK_ROYALTIES=true
   ```

## Reverting / Fallback

If anything breaks, change **one line** in `.env`:
```
VITE_ENABLE_FORK_ROYALTIES=false
```

Paid likes immediately fall back to the original direct-transfer flow. The old `cuerate_attribution` contract is untouched.

## Architecture

```
Frontend (Feed.tsx)
  -> sui-payments.ts
    -> If VITE_ENABLE_FORK_ROYALTIES=true:
       Build tx with tx.moveCall({ target: "...::royalties::receive_payment" })
    -> Else:
       Direct transfer (original behavior)

Backend (backend.ts)
  -> When forking:
     1. Call record_fork on cuerate_attribution package
     2. Call create_royalty_config on waltube_royalties package
     3. Store RoyaltyConfig object ID in Firestore on the prompt document
```

## Safety Notes

- Shares are validated on-chain: must sum to exactly 10,000.
- Last recipient gets the remainder to prevent rounding dust.
- Any leftover dust (should be 0-1 MIST) goes to the original creator.
- The contract never holds funds — it immediately distributes.

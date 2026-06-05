# Cuerate Sui Fork: Next Steps

This file captures what to do next when you are ready to continue.

## Current Architecture In Plain English

- **Google Console + Enoki zkLogin**: login/authentication. A user signs in with Google and gets a Sui address.
- **Walrus**: media/blob storage for prompt images, videos, thumbnails, and later metadata JSON.
- **Sui Move attribution**: permanent provenance records for original prompts and forks.
- **Firestore**: fast app database/index for the UI. It stores feed documents, profiles, likes, saves, follows, notifications, and pointers to Walrus/Sui objects.

Firestore is not the source of permanent proof. It is the fast social layer.
Sui/Walrus are the Web3 proof/storage layers.

## 1) Install Sui CLI

Your machine currently does not have:

- `sui`
- `choco`
- `winget`
- `cargo` / Rust

So use the manual Windows binary install.

1. Open:

   https://github.com/MystenLabs/sui/releases/latest

2. Download the Windows x86_64 archive.

3. Extract it to a stable folder, for example:

   ```text
   C:\sui
   ```

4. Confirm the binary path looks like:

   ```text
   C:\sui\sui.exe
   ```

5. Add it to PATH:

   ```powershell
   setx PATH "$env:PATH;C:\sui"
   ```

6. Close PowerShell completely, reopen it, then check:

   ```powershell
   sui --version
   ```

## 2) Configure Sui Testnet

If `testnet` already exists:

```powershell
sui client switch --env testnet
```

If it does not exist:

```powershell
sui client new-env --alias testnet --rpc https://fullnode.testnet.sui.io:443
sui client switch --env testnet
```

Get test SUI:

```powershell
sui client faucet
```

## 3) Build And Publish Move Attribution

Build:

```powershell
sui move build --path move/cuerate_attribution
```

Publish:

```powershell
sui client publish move/cuerate_attribution --gas-budget 100000000
```

After publishing, copy the package ID from the output and add it to `.env`:

```env
VITE_CUERATE_ATTRIBUTION_PACKAGE_ID=0xYOUR_PACKAGE_ID
```

Restart the dev server after editing `.env`.

## 4) Test Move Attribution

Create one original prompt.

Expected:

- media uploads to Walrus
- prompt appears in Firestore
- Sui `AttributionRecord` is created
- Firestore prompt gets:
  - `onchainAttributionId`
  - `onchainAttributionTxDigest`
  - `walrusContentBlobId`
  - `walrusMetadataBlobId`

Then fork that prompt.

Expected:

- fork appears in Firestore
- new Sui `AttributionRecord` is created
- fork record points to the parent attribution object
- Firestore stores the fork's attribution object ID and tx digest

## 5) Firestore Rules: Do You Need To Run Them?

Yes, if you are using your real Firebase/Firestore project.

Reason: the deployed Firestore rules may still expect Firebase Auth via `request.auth.uid`, but this fork now uses Enoki zkLogin and Sui addresses instead. If the old rules are still deployed, app writes can fail even though login works.

Deploy the current rules:

```powershell
npm run firebase:deploy-rules
```

If Firebase CLI is not logged in:

```powershell
npm run firebase:login
npm run firebase:use
npm run firebase:deploy-rules
```

Important: the current rules are hackathon/demo rules. They are meant to unblock the client-only zkLogin flow. For production, replace this with a backend that verifies zkLogin/Sui signatures or mints Firebase custom tokens.

## 6) What To Build Immediately After This

The next product/demo feature should be:

### Onchain Lineage UI

Add a visible section on prompt detail pages:

- "Verified on Sui"
- attribution object ID
- transaction digest
- parent prompt link if forked
- Walrus blob ID
- Sui explorer link

Judges need to see the Web3 work, not just hear about it.

## 7) Payment Streaming / Paid Likes Plan

Core idea:

Every like can become a tiny payment to the creator.

There are two possible payment routes:

### Option A: Sui-Native Payment Demo

Use SUI transfers first.

Best for Sui hackathon alignment.

Flow:

1. User taps Like.
2. App asks for/signs a tiny SUI transfer to the prompt creator.
3. Firestore records the like after payment success.
4. Firestore records a `paidLikes` receipt with the tx digest.
5. UI can later show "paid like" count / amount earned.

Pros:

- Strong Sui alignment.
- Simple narrative for Sui judges.
- Keeps identity, attribution, and payment on one chain.

Cons:

- User needs gas or sponsored tx setup.
- Very tiny payments may feel clunky if every like requires a wallet-style confirmation.

Current implementation:

- `src/lib/sui-payments.ts` builds and signs a SUI transfer transaction.
- Prompt likes on another Sui-address creator's card trigger payment before the Firestore like.
- Receipts are stored in the `paidLikes` Firestore collection.
- Configure with:

```env
VITE_ENABLE_SUI_PAID_LIKES=true
VITE_SUI_PAID_LIKE_MIST=1000000
```

`1000000` MIST = `0.001` SUI.

### Option B: Circle/x402 Paid Likes

Use x402 / USDC for payments.

Best for real commercial architecture.

Flow:

1. User taps Like.
2. Client calls a protected backend endpoint, e.g. `POST /api/paid-like`.
3. Backend responds with `402 Payment Required`.
4. Client completes x402 payment authorization.
5. Backend verifies payment.
6. Backend writes:
   - Firestore like
   - payment record
   - notification
   - creator earnings counter

Pros:

- Cleaner for micropayments.
- USDC is easier for creators to understand than SUI.
- Better long-term monetization story.
- x402 maps naturally to "pay per action".

Cons:

- Less Sui-native.
- Needs backend endpoints.
- Likely pulls payment rails toward Circle-supported chains, often EVM/Base/USDC.

## Recommended Hackathon Sequence

1. Finish Move attribution and lineage UI.
2. Add Sui-native tipping or paid-like MVP if time is short.
3. Present x402/Circle as the monetization roadmap.
4. If there is enough time, build x402 paid likes as a backend-powered bonus.

This gives you both:

- Sui-native hackathon scoring: zkLogin, Walrus, Move attribution.
- Strong business story: paid likes / creator monetization through USDC/x402.

## Suggested Backend Shape For x402 Later

Create endpoints:

```text
POST /api/paid-like
GET  /api/creator-earnings/:creatorId
GET  /api/payment-history/:userId
```

Firestore collections:

```text
paidLikes
creatorEarnings
paymentReceipts
```

Suggested `paidLikes` document:

```json
{
  "promptId": "firestorePromptId",
  "payerUid": "0xSuiOrCircleUser",
  "creatorUid": "0xCreator",
  "amount": "0.001",
  "currency": "USDC",
  "paymentRail": "x402",
  "paymentReference": "provider/payment/id",
  "createdAt": "timestamp"
}
```

Do not put every normal save/copy/follow onchain. Keep those in Firestore.

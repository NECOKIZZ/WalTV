# WalTube

**The decentralized social layer for AI video creators.** Your prompts live forever. Every remix is credited. Every creator gets paid.

WalTube is a social platform where AI video creators share prompts, discover workflows, build a following, and earn from their work — built natively on **Sui**, with media on **Walrus**, paywalls enforced by **Seal**, and gasless onboarding via **Enoki zkLogin**.

---

## What It Is

- **Prompt Cards** — Video-first posts carrying the exact prompt, model, tags, mood, and difficulty. One-tap copy. One-tap fork. One-tap tip.
- **Fork System** — Remix any prompt with automatic on-chain attribution. The fork tree is public, permanent, and tamper-proof.
- **Paid Likes** — A like can send SUI directly to the creator's wallet. No platform cut. Instant finality.
- **Fork Royalties** — When a forked prompt earns, a configurable percentage flows back up the fork chain to the original creators — atomically split by a Move contract.
- **Workflow Cards** — Multi-step, interactive tutorials that walk through complex AI pipelines step by step.
- **Premium Workflows** — Creators can paywall a workflow's steps. The content is **encrypted with Seal** (threshold IBE) and only decrypts after a viewer pays on-chain. The paywall is cryptographic, not a UI gate.
- **Gasless UX** — Posting, forking, and royalty setup are sponsored through Enoki, so new users never need to hold SUI to start creating.

---

## Architecture

WalTube is a **hybrid decentralized app**. Each layer does what it is best at: high-frequency social data lives in Firestore, high-value irreversible actions live on Sui, media and encrypted blobs live on Walrus, and paywall key management is delegated to Seal's key servers.

```
┌──────────────────────────────────────────────────────────────────┐
│                            Frontend                               │
│   React 18 · TypeScript · Vite · Tailwind v4 · Radix UI · MUI     │
└──────────────────────────────────────────────────────────────────┘
                                 │
   ┌──────────────┬──────────────┼──────────────┬──────────────┐
   ▼              ▼              ▼              ▼              ▼
┌────────┐   ┌──────────┐   ┌──────────┐   ┌────────┐   ┌──────────┐
│Firebase│   │   Sui    │   │  Walrus  │   │  Seal  │   │  Enoki   │
│Firestore│  │Blockchain│   │ Storage  │   │  IBE   │   │ zkLogin  │
└────────┘   └──────────┘   └──────────┘   └────────┘   └──────────┘
 Social      Attribution,   Permanent      Premium       Google
 graph &     royalties,     media +        workflow      sign-in +
 counters    premium        encrypted      paywall       sponsored
             paywalls       blobs          key servers   (gasless) tx
```

### Why this split?

- **Firestore** absorbs high-frequency, low-stakes writes (likes, saves, copies, follows, notifications, counters) with sub-second latency. Documents are keyed by the user's Sui address.
- **Sui** records high-value, irreversible actions — fork attribution, paid likes, royalty splits, and premium access policies — with cryptographic finality.
- **Walrus** stores what actually matters: permanent, content-addressed media (videos, thumbnails, avatars) and the **encrypted ciphertext** of premium workflows. No single entity can delete it.
- **Seal** runs the premium paywall. Workflow steps are encrypted under an identity-based scheme; a network of threshold key servers only releases decryption shares when an on-chain Move check (`seal_approve`) confirms the viewer paid.
- **Enoki** provides zkLogin (Google → Sui wallet, no seed phrase) and **sponsored transactions** so onboarding actions cost the user zero gas.

---

## Smart Contracts (Move)

Three independently deployable Move packages under `/move`. Each is gated by an env var — if a package ID is unset, the frontend skips its on-chain calls and falls back gracefully.

| Package | Module | Purpose |
|---------|--------|---------|
| **`cuerate_attribution`** | `attribution` | Records an immutable, **shared** `AttributionRecord` for every prompt and fork. Tracks `original_author`, `creator`, `fork_depth`, parent record/key, and root prompt. `record_prompt` / `record_fork` emit `PromptRecorded` / `PromptForked` events. Records are shared objects so any account can fork from them. |
| **`waltube_royalties`** | `royalties` | Per-prompt `RoyaltyConfig` (parallel `recipients` / `shares_bps` arrays that must sum to 10,000 bps) plus a global `RoyaltyRegistry` mapping prompt keys → config IDs. `receive_payment` atomically splits one SUI coin across all recipients in a single transaction, sending rounding dust to the first recipient. |
| **`waltube_premium`** | `premium` | The Seal paywall. `create_access_policy(price_mist)` mints a **shared `WorkflowAccessPolicy`**; its object ID becomes the Seal IBE identity for the encrypted blob. `pay_and_unlock` transfers SUI to the creator and adds the payer to the allowlist. `seal_approve` is the access check key servers run via dry-run — it binds the requested identity to the policy's own (unforgeable) object ID, then requires the caller to be the creator or an unlocked user. |

**Why the policy object ID is the encryption identity:** Sui object IDs are globally unique and cannot be forged or replayed onto another object. Because the encrypted blob's IBE identity *is* the policy ID, an attacker cannot mint a competing policy (making themselves its `creator`) that matches an already-encrypted blob. That binding is what makes the paywall sound — so the policy must be created **before** encryption.

---

## Key Flows

### Posting a prompt
1. Creator uploads media → Walrus publisher → returns `blobId`.
2. Prompt metadata (text, model, tags) + `blobId` → Firestore `prompts`.
3. If attribution is configured, `record_prompt` creates an `AttributionRecord` on Sui — **sponsored** by Enoki (gasless).
4. The record's object ID is saved back onto the Firestore prompt.

### Forking a prompt
1. A new prompt doc is created with `isForked: true` and `forkedFromId` set.
2. `record_fork` creates a child `AttributionRecord` linked to its parent (sponsored).
3. If royalties are enabled, `create_royalty_config` registers the split (e.g. 5% to the original author, 95% to the fork creator) in the `RoyaltyRegistry` (sponsored).

### Liking / tipping a prompt
1. If the prompt has a `royaltyConfigId` and royalties are enabled → `receive_payment` splits the SUI across the configured recipients.
2. Otherwise → a direct `transferObjects` to the prompt author.
3. Either way, `paymentsApi.recordPaidLike` logs the transaction in Firestore. *(Paid likes are user-paid by design — the user is actively spending into the creator economy, not onboarding.)*

### Publishing & unlocking a premium workflow
1. Creator calls `create_access_policy(priceMist)` → shared `WorkflowAccessPolicy` (its ID is the Seal identity).
2. Creator encrypts `steps[]` with Seal under that identity and uploads the ciphertext to Walrus.
3. Workflow doc stores `sealAccessPolicyId`, `sealEncryptedBlobId`, `unlockPriceMist`, and `sealPackageId`.
4. A viewer pays via `pay_and_unlock(policy, payment)` → added to the on-chain allowlist; the unlock is mirrored to `users/{uid}/unlocked_workflows`.
5. Viewer decrypts: create a `SessionKey` (one wallet signature per TTL) → build a PTB calling `seal_approve` → `sealClient.decrypt(...)`. Key servers run the PTB via dry-run; if `seal_approve` aborts, no shares are released.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Build tool | Vite 6 |
| Router | React Router v7 |
| Styling | Tailwind CSS v4 + custom CSS variables |
| UI | Radix UI primitives + MUI + Lucide icons |
| Animation | Motion (Framer Motion successor) |
| Data fetching | TanStack Query |
| Off-chain backend | Firebase Firestore |
| Blockchain | Sui (Move) via `@mysten/sui` + `@mysten/dapp-kit` |
| Auth & gas sponsorship | Enoki zkLogin (`@mysten/enoki`) |
| Decentralized storage | Walrus (Publisher / Aggregator HTTP API) |
| Encryption / paywall | Seal (`@mysten/seal`) |
| Serverless | Vercel Functions (`/api/enoki/*`) |

---

## Project Structure

```
/src
  /app
    /components        # PromptCard, WorkflowCard, Layout, WalletModal, ForkPromptModal, ui/
    /screens           # Landing, Feed, Explore, Post, PromptDetail, WorkflowDetail,
    │                  #   MyProfile, UserProfile, Notifications, Settings, Auth,
    │                  #   Onboarding, ZkLoginCallback
    App.tsx            # Root component
    routes.tsx         # React Router config
  /lib
    backend.ts         # Firestore API surface (prompts, workflows, users, follows,
    │                  #   likes, saves, payments, notifications, workflowUnlocks…)
    firebase.ts        # Firebase app + Firestore init
    auth-context.tsx   # zkLogin session state via Enoki react hooks
    sui.ts             # Sui client + network config
    sui-payments.ts    # Direct SUI transfer helpers (paid likes / tips)
    attribution.ts     # cuerate_attribution PTB builders
    royalties.ts       # waltube_royalties PTB builders
    seal.ts            # Seal encrypt/decrypt + waltube_premium PTB builders
    sponsored-tx.ts    # Enoki sponsored (gasless) execution + user-paid fallback
    walrus.ts          # Walrus publish/read client
    media.ts           # Upload orchestration
    types.ts           # Shared TypeScript models
    useBackendQuery.ts # TanStack Query hooks
  /styles              # Tailwind + theme CSS
/api/enoki
  sponsor.ts           # Serverless: build sponsored tx with the PRIVATE Enoki key
  execute.ts           # Serverless: execute the signed sponsored tx
  pending-digests.ts   # In-memory digest tracking helper
/move
  /cuerate_attribution # AttributionRecord contract
  /waltube_royalties   # RoyaltyConfig + RoyaltyRegistry contract
  /waltube_premium     # WorkflowAccessPolicy + Seal seal_approve contract
```

### Firestore collections

`users` · `prompts` · `promptLikes` · `promptSaves` · `promptCopies` · `paidLikes` · `workflows` · `workflowLikes` · `workflowSaves` · `userFollows` · `notifications` · `collections`, plus the `users/{uid}/unlocked_workflows` subcollection. Access is enforced by `firestore.rules`.

---

## Authentication

**zkLogin via Enoki.** Users sign in with Google; behind the scenes a zero-knowledge proof derives a Sui wallet address from their OAuth credential. No seed phrase, no browser extension, no crypto knowledge required.

Firestore documents are keyed by the user's Sui address — **Firebase Auth is not used.**

---

## Sponsored (Gasless) Transactions

Onboarding actions are sponsored so users never need SUI to start:

- **Sponsored (gasless):** `record_prompt`, `record_fork`, `create_royalty_config`.
- **User-paid (by design):** paid likes/tips and wallet withdrawals (anti-drain).

In **production**, sponsorship is brokered through the serverless endpoints in `/api/enoki`, which hold the **private** Enoki key and derive the allowed Move-call targets server-side (never trusting the client). In **development**, the frontend talks to Enoki directly with the public key. The user always signs the wrapped bytes themselves, so they remain the sender of record while Enoki pays the gas. If sponsorship is impossible (budget exhausted, target not allowlisted, network down), the flow falls back to user-paid execution.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values.

### Core

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_*` | Firebase web config (API key, project ID, app ID, …) |
| `VITE_SUI_NETWORK` | `testnet` or `mainnet` |
| `VITE_ENOKI_PUBLIC_API_KEY` | Public Enoki key (browser) for zkLogin |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth web client ID used by zkLogin |

### Walrus storage

| Variable | Description |
|----------|-------------|
| `VITE_WALRUS_NETWORK` | `testnet` or `mainnet` |
| `VITE_WALRUS_EPOCHS_TESTNET` / `VITE_WALRUS_EPOCHS_MAINNET` | Blob retention in epochs (defaults 20 / 52) |
| `VITE_WALRUS_PUBLISHER_URL` / `VITE_WALRUS_AGGREGATOR_URL` | Optional self-hosted endpoint overrides |
| `VITE_WALRUS_SEND_OBJECT_TO` | Optional Sui address to own the blob object |

### On-chain features

| Variable | Description |
|----------|-------------|
| `VITE_WALTUBE_ATTRIBUTION_PACKAGE_ID` | Published `cuerate_attribution` package |
| `VITE_WALTUBE_ROYALTIES_PACKAGE_ID` | Published `waltube_royalties` package |
| `VITE_WALTUBE_ROYALTIES_REGISTRY_ID` | Shared `RoyaltyRegistry` object ID |
| `VITE_ENABLE_FORK_ROYALTIES` | Toggle royalty routing (`true` / `false`) |
| `VITE_ENABLE_SUI_PAID_LIKES` | Toggle paid likes (`true` / `false`) |
| `VITE_SUI_PAID_LIKE_MIST` | Amount per like in MIST (`1000000` = 0.001 SUI) |

### Premium workflows (Seal)

| Variable | Description |
|----------|-------------|
| `VITE_SEAL_PACKAGE_ID` | Published `waltube_premium` package. **Unset = premium features hidden entirely.** |
| `VITE_SEAL_VERIFY_KEY_SERVERS` | Verify key servers (default `true`; set `false` only for flaky local dev) |
| `VITE_SEAL_DEBUG` | Verbose Seal encrypt/decrypt logging (default on) |

### Server-side (NOT prefixed with `VITE_` — set in Vercel, never committed)

| Variable | Description |
|----------|-------------|
| `ENOKI_PRIVATE_API_KEY` | Private Enoki key used by `/api/enoki/sponsor.ts` |
| `ENOKI_API_CORS_ORIGIN` | Allowed origin for the sponsor/execute endpoints |

### Revert strategy

Every on-chain feature is independently killable without a code change — the app treats missing package IDs and disabled flags as "not configured" and falls back to direct transfers or skips the on-chain write:

```bash
VITE_ENABLE_SUI_PAID_LIKES=false      # disable paid likes
VITE_ENABLE_FORK_ROYALTIES=false      # fall back to direct creator payment
VITE_WALTUBE_ATTRIBUTION_PACKAGE_ID=  # skip attribution Move calls
VITE_SEAL_PACKAGE_ID=                 # hide premium workflows entirely
```

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Fill in Firebase, Enoki, Sui, Walrus, and (optionally) Seal values
```

### 3. Run locally

```bash
npm run dev
```

### 4. Deploy Firestore rules & indexes

```bash
npm run firebase:login
npm run firebase:use            # selects the cuerateweb3 project
npm run firebase:deploy-rules   # deploys firestore + storage rules
```

### 5. (Optional) Deploy the Move contracts

Only needed to run your own on-chain instance:

```bash
# Attribution
cd move/cuerate_attribution && sui move build && sui client publish --gas-budget 50000000
# → set VITE_WALTUBE_ATTRIBUTION_PACKAGE_ID

# Royalties
cd ../waltube_royalties && sui move build && sui client publish --gas-budget 50000000
# → call create_registry once, then set
#   VITE_WALTUBE_ROYALTIES_PACKAGE_ID and VITE_WALTUBE_ROYALTIES_REGISTRY_ID

# Premium (Seal paywall)
cd ../waltube_premium && sui move build && sui client publish --gas-budget 50000000
# → set VITE_SEAL_PACKAGE_ID
```

---

## Deployment

- **Frontend** builds with `npm run build` (Vite) and deploys to **Vercel**, which also hosts the `/api/enoki/*` serverless functions. SPA routing is handled by the rewrite in `vercel.json`. Set `ENOKI_PRIVATE_API_KEY` and `ENOKI_API_CORS_ORIGIN` in the Vercel dashboard.
- **Firestore rules/indexes** and **Storage rules** deploy via the Firebase CLI (`firebase` project `cuerateweb3`).

---

## License

Built with React, Tailwind CSS, Firebase, Sui, Walrus, Seal, and Enoki zkLogin. See `ATTRIBUTIONS.md` for asset credits.

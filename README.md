# WalTube

The decentralized social layer for AI video creators. Your prompts live forever. Every remix is credited. Every creator gets paid.

## What It Is

WalTube is a social platform for AI video creators to share prompts, discover workflows, build followings, and earn from their work — built natively on the Sui blockchain.

- **Prompt Cards** — Video-first posts with the exact prompt, model, tags, mood, and difficulty. One-tap copy. One-tap fork. One-tap tip.
- **Fork System** — Remix any prompt with automatic on-chain attribution. The fork tree is visible and permanent.
- **Paid Likes** — Every like can send 0.001 SUI directly to the creator's wallet. No platform cut. Instant.
- **Fork Royalties** — When a forked prompt earns money, a percentage flows back to the original creator automatically, enforced by a Move smart contract.
- **Workflow Cards** — Multi-step interactive tutorials that walk through complex AI pipelines step by step.

## Architecture

WalTube is a **hybrid decentralized app**: high-frequency social data lives in Firebase Firestore; high-value, irreversible actions live on Sui; media lives on Walrus.

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  React 18 + TypeScript + Vite + Tailwind CSS v4 + Radix UI │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
   ┌─────────┐         ┌──────────┐          ┌──────────┐
   │Firebase │         │   Sui    │          │  Walrus  │
   │Firestore│         │Blockchain│          │ Storage  │
   └─────────┘         └──────────┘          └──────────┘
   Social graph        Attribution,          Permanent media
   (users, follows,    royalties, zkLogin     (videos, thumbnails,
   likes, saves,       identity              avatars, workflow media)
   notifications)
```

### Why This Split?

- **Firestore** handles high-frequency, low-stakes actions (likes, saves, copies, follows) with sub-second latency.
- **Sui** handles high-value, irreversible actions (fork attribution, paid likes, royalty payments, zkLogin identity) with cryptographic finality.
- **Walrus** handles what actually matters — permanent media and verifiable blob ownership. No single entity can delete it.

### Smart Contracts

| Contract | Package | Purpose |
|----------|---------|---------|
| **`cuerate_attribution`** | `move/cuerate_attribution` | Records `AttributionRecord` objects on-chain for every prompt and fork. Tracks original author, fork depth, parent record, and timestamp. |
| **`waltube_royalties`** | `move/waltube_royalties` | Creates per-prompt `RoyaltyConfig` objects and atomically splits SUI payments across multiple recipients. `receive_payment` distributes to all configured recipients in a single transaction. |

### Data Flow

**Posting a video:**
1. Creator uploads media → Walrus Publisher API → returns `blobId`
2. Prompt metadata (text, model, tags) + `blobId` → Firestore `prompts` collection
3. If attribution is configured, `record_prompt` Move call creates an `AttributionRecord` on Sui
4. `AttributionRecord` object ID saved back to Firestore prompt document

**Forking a prompt:**
1. New prompt document created in Firestore with `isForked: true`, `forkedFromId` set
2. `record_fork` Move call creates a new `AttributionRecord` linking to parent
3. `create_royalty_config` Move call creates a `RoyaltyConfig` (e.g., 5% parent, 95% fork creator)
4. `RoyaltyConfig` object ID saved back to Firestore prompt document

**Liking a prompt:**
1. If prompt has `royaltyConfigId` and fork royalties are enabled → `receive_payment` Move call splits SUI across all configured recipients
2. Otherwise → direct `transferObjects` to the prompt author
3. `paymentsApi.recordPaidLike` stores the transaction in Firestore

## Environment Variables

Copy `.env.example` to `.env` and fill in your values.

### Required

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Firebase web API key |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_*` | Other Firebase config values (see `.env.example`) |
| `VITE_ENOKI_PUBLIC_API_KEY` | Enoki zkLogin public API key |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID for zkLogin |
| `VITE_SUI_NETWORK` | `testnet` or `mainnet` |

### Walrus Storage

| Variable | Description |
|----------|-------------|
| `VITE_WALRUS_NETWORK` | `testnet` or `mainnet` |
| `VITE_WALRUS_EPOCHS_TESTNET` | Number of epochs for testnet storage (default: 20) |
| `VITE_WALRUS_EPOCHS_MAINNET` | Number of epochs for mainnet storage (default: 52) |
| `VITE_WALRUS_PUBLISHER_URL` | Custom Walrus publisher URL (optional) |
| `VITE_WALRUS_AGGREGATOR_URL` | Custom Walrus aggregator URL (optional) |

### On-Chain Features

| Variable | Description |
|----------|-------------|
| `VITE_ENABLE_SUI_PAID_LIKES` | Toggle paid likes (`true` / `false`) |
| `VITE_SUI_PAID_LIKE_MIST` | Amount per like in MIST (`1000000` = 0.001 SUI) |
| `VITE_WALTUBE_ATTRIBUTION_PACKAGE_ID` | Published `cuerate_attribution` package ID |
| `VITE_WALTUBE_ROYALTIES_PACKAGE_ID` | Published `waltube_royalties` package ID |
| `VITE_WALTUBE_ROYALTIES_REGISTRY_ID` | Shared `RoyaltyRegistry` object ID |
| `VITE_ENABLE_FORK_ROYALTIES` | Toggle fork royalty routing (`true` / `false`) |

### Revert Strategy

If anything breaks with on-chain features, you can instantly disable them without a code change:

```bash
# Disable paid likes
VITE_ENABLE_SUI_PAID_LIKES=false

# Disable fork royalties (falls back to direct transfer)
VITE_ENABLE_FORK_ROYALTIES=false

# Disable attribution (frontend skips Move calls gracefully)
VITE_WALTUBE_ATTRIBUTION_PACKAGE_ID=
```

The app treats missing package IDs and disabled flags as "not configured" and falls back to direct SUI transfers or skips on-chain writes entirely.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your Firebase, Enoki, and Sui values
```

### 3. Run Locally

```bash
npm run dev
```

### 4. Deploy Firestore Rules

```bash
npm run firebase:login
npm run firebase:use
npm run firebase:deploy-rules
```

### 5. Deploy Move Contracts (Optional)

If you're deploying your own instance of the on-chain contracts:

```bash
cd move/cuerate_attribution
sui move build
sui client publish --gas-budget 50000000
# Set VITE_WALTUBE_ATTRIBUTION_PACKAGE_ID in .env

cd move/waltube_royalties
sui move build
sui client publish --gas-budget 50000000
# Call create_registry to get the RoyaltyRegistry object ID
# Set VITE_WALTUBE_ROYALTIES_PACKAGE_ID and VITE_WALTUBE_ROYALTIES_REGISTRY_ID in .env
```

## Project Structure

```
/src
  /app
    /components       # Reusable UI components (PromptCard, Layout, etc.)
    /screens          # Route-level screens (Feed, Post, Explore, etc.)
    App.tsx           # Root component
    routes.tsx        # React Router configuration
  /lib
    backend.ts        # Firebase Firestore API (prompts, users, follows, likes, etc.)
    auth-context.tsx  # zkLogin auth state and Enoki flow management
    sui-payments.ts   # Direct SUI transfer helpers for paid likes
    attribution.ts    # cuerate_attribution Move contract transaction builders
    royalties.ts      # waltube_royalties Move contract transaction builders
    types.ts          # TypeScript interfaces (Prompt, User, PaidLike, etc.)
    useBackendQuery.ts# Data fetching hooks
  /styles             # Tailwind + custom theme CSS
/move
  /cuerate_attribution   # AttributionRecord Move contract
  /waltube_royalties     # RoyaltyConfig + RoyaltyRegistry Move contract
```

## Authentication

**zkLogin via Enoki** — Users sign in with Google. Behind the scenes, a zero-knowledge proof derives a Sui wallet address from their OAuth credential. No seed phrase. No browser extension. No crypto knowledge required.

Firestore documents are keyed by the user's Sui address. Firebase Auth is not used.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Build Tool | Vite |
| Router | React Router v7 |
| Styling | Tailwind CSS v4 + Custom CSS Variables |
| UI Primitives | Radix UI |
| Icons | Lucide React |
| Animations | Motion (Framer Motion successor) |
| Charts | Recharts |
| Backend | Firebase Firestore |
| Auth | Enoki zkLogin |
| Blockchain | Sui (Move) |
| Storage | Walrus |

## License

Built with React, Tailwind CSS, Firebase, Sui, Walrus, and Enoki zkLogin.

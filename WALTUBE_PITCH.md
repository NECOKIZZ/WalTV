# WalTube

> The decentralized social layer for AI video creators. Your prompts live forever. Every remix is credited. Every creator gets paid.

---

## 1. The Problem

AI video creation is exploding — Sora, Runway, Kling, Pika, and dozens of other tools are generating millions of clips every day. But the ecosystem around these creators is broken in three fundamental ways:

### No Attribution
When someone shares a viral AI prompt, there is no way to prove who created it originally. Copy-paste culture strips creators of credit. A prompt that gets remixed 100 times has no visible family tree.

### No Permanence
Prompts, videos, and workflows live on centralized servers — company-owned databases that can delete content, shut down, or change terms overnight. A creator's entire portfolio can disappear because a startup ran out of money.

### No Monetization
The people who write the best prompts get nothing. Instagram and TikTok built billion-dollar businesses on creator content without paying creators fairly. AI prompt creators face the exact same problem — their intellectual labor generates value for platforms and other users, but they have no way to capture that value.

---

## 2. What WalTube Is

WalTube is a mobile-first social platform where AI video creators share prompts, discover workflows, build followings, and earn from their work — built natively on the Sui blockchain.

Think **Instagram × GitHub for AI video prompts**, but with one critical difference: every piece of content is a permanent, verifiable, ownable digital asset.

### The Name

**Wal** from Walrus — Sui's decentralized storage protocol where all media lives.
**Tube** from the universal shorthand for video sharing.

---

## 3. Core Features

### 3.1 Prompt Cards

The atomic unit of WalTube is the **Prompt Card** — a rich media post that contains:

- **Video or image output** — the actual generation result
- **Prompt text** — the exact text used to create it
- **Metadata** — AI model (Sora, Runway, Kling, Pika, Hailuo), style tags (cinematic, surreal, neon), mood label, difficulty level, camera notes
- **Social actions** — Like, Save, Copy, Fork, Share
- **Attribution** — Onchain record linking back to the original creator

Prompt cards are displayed in a responsive masonry feed with glassmorphism UI, shimmer loading states for perceived performance, and hover-to-play video previews.

### 3.2 Workflow Cards

Not all generations are single prompts. **Workflow Cards** are multi-step tutorials that walk viewers through complex pipelines — e.g., "Generate a character image → Animate with Runway → Add lip-sync with Hedra → Color grade with DaVinci."

Each workflow step includes:
- Input media (starting frame, reference image, ingredients)
- The prompt text for that step
- The model/tool used
- The result media
- Optional notes and tips

Workflows are visually distinguished with golden amber accents, step-count badges, and dedicated detail pages that function as interactive tutorials.

### 3.3 The Fork System

WalTube treats prompts like open-source code.

- **Copy** — One-tap copy the prompt text to your clipboard. The original creator's "copies" counter increments.
- **Fork** — Create a new prompt based on an existing one. The fork retains a permanent attribution chain (`forkedFromId` + `forkedFromAuthorHandle`) that links back to the original creator — and increasingly, an onchain Move contract record.

This creates a **Git-like contribution graph** for creative work. Every viral prompt has a visible ancestry. Original creators get permanent, cryptographic credit even after 100 generations of remixes.

### 3.4 Per-Like Streaming (Paid Likes)

This is WalTube's killer monetization feature. Instead of a meaningless heart icon, every like can optionally send a micro-tip directly to the creator's Sui wallet — as little as 0.001 SUI.

- Tippers see a confetti celebration on successful payment
- Creators accumulate tips in real time
- No platform cut. No minimum threshold. Direct wallet-to-wallet transfer.

It turns social engagement into actual income. A prompt with 10,000 likes can generate meaningful revenue without ads, subscriptions, or sponsorships.

### 3.5 Verifiable Storage on Walrus

All media — prompt videos, thumbnails, avatars, workflow step media — is stored on **Walrus**, Sui's decentralized blob storage protocol.

What this means practically:
- **Content-addressed** — Every file has a permanent blob ID derived from its content. If the file changes, the ID changes. Tamper-proof by design.
- **Censorship-resistant** — Files are sharded across 100+ storage nodes. No single entity can delete them.
- **Permanent** — As long as storage epochs are paid (automatically managed), content lives forever.
- **Verifiable** — Anyone can fetch a blob by ID and confirm it matches the hash recorded onchain.

Switching between testnet and mainnet is a one-line config change. The storage layer is abstracted so creators never think about it — they just post, and their content becomes permanent.

### 3.6 Collections & Saves

Users organize saved prompts into curated **Collections** — e.g., "Cinematic Lighting," "Character Design," "Surreal Landscapes." Collections are private to the user and displayed on their profile.

### 3.7 Discovery & Filtering

- **Trending tags** — See which style tags (cinematic, neon, macro) are getting the most engagement
- **Top creators** — Ranked by followers, with model expertise badges
- **Model filters** — Filter the entire feed by AI tool (Sora, Runway, Kling, etc.)
- **Style filters** — Filter by aesthetic tag

### 3.8 Notifications

Real-time notification system for:
- Likes on your prompts/workflows
- Forks of your prompts
- New followers
- Prompt saves

### 3.9 On-Chain Attribution (Move Smart Contract)

Every fork operation can create an onchain record via a Sui Move smart contract:

```move
struct PromptFork has key, store {
    id: UID,
    original_blob_id: vector<u8>,
    original_author: address,
    fork_author: address,
    fork_depth: u64,
    timestamp: u64,
}
```

This transforms attribution from an honor system into a cryptographic guarantee.

---

## 4. Architecture & Stack

### 4.1 Frontend

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Build Tool | Vite |
| Router | React Router v7 |
| Styling | Tailwind CSS v4 + Custom CSS Variables |
| UI Primitives | Radix UI (accessible, unstyled components) |
| Icons | Lucide React |
| State | React Context + custom hooks |
| Animations | Motion (Framer Motion successor) + CSS keyframes |
| Charts | Recharts |

### 4.2 Authentication

**zkLogin via Enoki** — Users sign in with Google (or Apple/Facebook). Behind the scenes, a zero-knowledge proof derives a Sui wallet address from their OAuth credential. No seed phrase. No browser extension. No crypto knowledge required.

The onboarding flow is 3 steps: pick a handle, select your AI models, follow top creators. Takes under 60 seconds.

### 4.3 Backend / Data Layer

| Service | Purpose |
|---------|---------|
| **Firebase Firestore** | Social graph (users, follows, likes, saves, copies, notifications, collections) |
| **Walrus** | Decentralized media storage (videos, thumbnails, avatars, workflow media) |
| **Sui Blockchain** | Onchain attribution records (Move contracts), SUI tipping, zkLogin identity |

Firebase handles high-frequency, low-stakes social actions (likes, saves, copies) with sub-second latency. Sui handles high-value, irreversible actions (forks with attribution, paid likes, storage blob ownership).

### 4.4 Smart Contracts

| Contract | Purpose |
|----------|---------|
| **Attribution Package** | Records fork events onchain with original author, fork author, timestamp, and fork depth |
| **Paid Like Tipping** | Wallet-to-wallet SUI transfers on every like |

### 4.5 Storage Architecture

```
User uploads video/image
    → Walrus Publisher API (HTTP or SDK)
    → Returns blobId
    → blobId stored in Firestore prompt document
    → Media served via Walrus Aggregator URL
```

Content is immutable. The blob ID in Firestore is the single source of truth. If a user updates their avatar, a new blob is published and the ID is swapped — the old blob remains addressable forever.

### 4.6 Design System

- **Mobile-first** — Optimized for 430px viewport, fully responsive to desktop
- **Dark mode default** — Pure black (`#000000`) background
- **Glassmorphism** — `rgba(255,255,255,0.035)` surfaces with backdrop blur
- **No sharp edges** — Pill-shaped buttons (999px radius), heavily rounded cards
- **Color accents**:
  - Indigo (`#6F00FF`) — Identity, selections, active states, glows
  - Blue (`#1877F2`) — Prompt cards, actions, play buttons
  - Amber/Gold — Workflow cards (distinguished visual identity)
- **Typography**: Bricolage Grotesque (primary) + Inter (technical/secondary)

---

## 5. How It All Works Together

### The Creator Journey

1. **Sign in** — Tap "Sign in with Google." zkLogin creates a Sui wallet invisibly. No seed phrase.
2. **Onboard** — Pick a handle, select your AI models, follow 3 creators. Done in 45 seconds.
3. **Post** — Upload your generation. Prompt text, model, tags, and mood are auto-filled or manually entered. Media goes to Walrus. Metadata goes to Firestore. Attribution hash optionally goes onchain.
4. **Get discovered** — Your prompt appears in the feed, on the Explore page, and in model-specific filters.
5. **Get credited** — Someone forks your prompt. A Move contract record is created. Their post links back to yours. Your "forks" counter increments.
6. **Get paid** — Someone likes your prompt with the paid-like feature enabled. 0.001 SUI transfers directly to your wallet. No platform fee.

### The Consumer Journey

1. **Browse** — Scroll the feed. Filter by model or style. Hover to preview videos.
2. **Copy** — One tap copies the prompt text to clipboard. The creator gets a "copy" stat.
3. **Fork** — Remix the prompt with your own text. The fork retains attribution to the original.
4. **Save** — Bookmark to a collection for later.
5. **Tip** — Like with SUI attached. The creator earns instantly.

---

## 6. Competitive Differentiation

| Platform | Attribution | Permanence | Monetization | Web3 Native |
|----------|------------|-----------|-------------|-------------|
| Instagram | None | Centralized | Ads only | No |
| TikTok | None | Centralized | Creator fund | No |
| PromptBase | None | Centralized | Marketplace fees | No |
| CivitAI | Basic | Centralized | Tips (platform cut) | No |
| **WalTube** | **Onchain, cryptographic** | **Walrus decentralized** | **Direct, zero-fee** | **Yes** |

WalTube is not just another social app with a wallet button. The Web3 integrations are **load-bearing**:
- Walrus isn't an add-on — it is the storage layer
- zkLogin isn't a sign-in option — it is the only auth method
- Onchain attribution isn't a badge — it is the enforcement mechanism
- Paid likes aren't a feature — they are the business model

---

## 7. Track Fit

**Primary track:** Entertainment and Culture

**Secondary justifications:**
- **Programmable Storage** — Walrus-native media storage
- **Payments and Wallets** — SUI creator tipping, zkLogin onboarding
- **AI** — AI metadata generation, prompt marketplace concept

---

## 8. Team & Vision

WalTube is built for the next generation of AI creators — the people who are right now figuring out how to make Sora produce cinematic masterpieces, how to chain Runway + Kling + Hedra into professional workflows, and how to build audiences around their creative process.

The long-term vision is a full **prompt marketplace** where creators list their best prompts at fixed SUI prices, buyers receive a verified copy NFT, and every downstream fork automatically routes a royalty percentage back to the original creator — all enforced by Move smart contracts.

The infrastructure is already here. Walrus gives us permanent storage. Sui gives us sub-second finality and sub-cent transactions. zkLogin gives us mainstream onboarding. WalTube connects all three into a product that AI creators actually want to use.

---

*Built with React, Tailwind CSS, Firebase, Sui, Walrus, and Enoki zkLogin.*

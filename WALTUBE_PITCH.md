# WalTube

> The decentralized social layer for AI video creators. Your prompts live forever. Every remix is credited. Every creator gets paid.

---

## 1. The Problem

### The Market Is Exploding

AI video creation didn't exist as a category three years ago. Today it's a multi-billion dollar industry. The tools — Sora, Runway, Kling, Pika, Hailuo — are generating millions of clips every day. A new class of creator has emerged: people who don't hold cameras but understand models, know how to craft prompts, and can produce cinematic content from a text box. They are building audiences, developing techniques, and creating genuine intellectual value.

The AI video generation market was valued at roughly $4 billion in 2024 and is projected to grow at over 30% annually through the next decade. The creators driving this are at the center of the fastest-growing content category on the internet.

And the platforms are actively working against them.

### The Platforms Are Hostile

Traditional platforms don't know what to do with AI creators — so they've decided to penalize them.

YouTube introduced mandatory AI content disclosure requirements in 2024 and updated its monetization policy in July 2025 to demonetize AI-generated videos that lack what it defines as "sufficient human creative input." The policy is vague by design, giving the platform discretion to cut revenue from AI creators whenever advertiser pressure demands it.

TikTok removed over 51,000 synthetic media videos in the second half of 2025 alone — a 340% increase over the previous year — and permanently banned 8,600 accounts for AI-related violations. A fourth offense on TikTok now results in a permanent monetization ban.

The pattern is clear: platforms built their businesses on creator content, then changed the rules when that content became inconvenient for their advertiser relationships. AI creators are the latest group to discover that monetization on someone else's platform is always conditional.

### The Three Failures That Remain

**No Attribution.** When someone shares a viral AI prompt, there is no way to prove who created it originally. Copy-paste culture strips creators of credit. A prompt that gets remixed 100 times has no visible family tree.

**No Permanence.** Prompts, videos, and workflows live on centralized servers — company-owned databases that can delete content, restrict access, or shut down overnight. A creator's entire portfolio can disappear because a startup ran out of money, or because an algorithm update decided their content no longer fits the platform's brand safety guidelines.

**No Monetization That Lasts.** The people who write the best prompts get nothing stable. Creator funds get cut. Monetization policies change. Ad revenue depends entirely on platform goodwill. The creator who builds an audience on someone else's platform is one policy update away from zero.

### The Untapped B2B Layer

There is a fourth problem nobody is talking about: brands and studios cannot find AI video talent efficiently.

The demand for AI-generated video content in commercial contexts — advertising, branded content, product visualization, entertainment — is growing faster than the supply of skilled creators. Right now, a brand looking to hire the best Kling cinematographer or the creator who specializes in surreal product reveals has no structured way to find them. Talent is scattered across Instagram, X, Discord servers, and personal portfolios with no standardized way to evaluate skill or track record.

WalTube creates a public, permanent, verifiable record of every creator's work — model expertise, prompt quality, fork influence, and audience engagement, all onchain. For the first time, a brand can search for "cinematic product reveal, Runway, 10k+ forks" and find the actual best person for the job — not the most followed person, but the most skilled one, with a cryptographic portfolio to back it up.

This turns WalTube into more than a social platform. It becomes the talent layer of the AI video economy.

---

## 2. What WalTube Is

A creator posted a Kling prompt in March. 8,000 people copied it. She got zero credit and zero dollars. WalTube fixes that.

WalTube is a social platform for AI video creators to share prompts, discover workflows, build followings, and earn from their work — built natively on the Sui blockchain, accessible on any device.

Every piece of content is a permanent, verifiable, ownable digital asset. For creators, that means getting paid and credited for work that currently earns them nothing. For brands and studios, it means a searchable, verifiable talent pool — find the best AI video creators by skill, model expertise, and proven output, not by follower count.

### The Name

**Wal** from Walrus — Sui's decentralized storage protocol where all media lives.
**Tube** from the universal shorthand for video sharing.

---

## 3. Core Features — And Why They Win

### 3.1 Per-Like Payments (Paid Likes)

**What traditional platforms do:** Instagram, TikTok, and X give creators a heart icon. That's it. Monetization comes from brand deals you have to chase yourself, or a creator fund that pays fractions of a cent per thousand views — controlled entirely by the platform.

**What WalTube does:** Every like is an optional micro-payment. A fan taps like and sends 0.001 SUI directly to the creator's wallet in the same action. No platform cut. No minimum payout threshold. No waiting 30 days to withdraw. Wallet-to-wallet, instant, on every single like.

A prompt with 10,000 engaged fans doesn't generate an algorithm score. It generates real income — without ads, without sponsorships, without asking permission from anyone.

Technical: Implemented as a Sui smart contract triggered at the like action. Sub-cent transaction fees on Sui make this economically viable at any scale.

---

### 3.2 Fork Attribution — Onchain, Forever

**What traditional platforms do:** When someone copies your prompt, remixes your workflow, or builds on your creative work — you get nothing. No credit. No record. No way to even prove you made it first. Content theft is the default.

**What WalTube does:** Every fork writes an immutable record to the Sui blockchain. The fork chain is permanent and public — it shows exactly who made what, who built on it, and how deep the remix tree goes. This isn't a badge. It's a cryptographic guarantee enforced by a Move smart contract.

```move
public struct AttributionRecord has key, store {
    id: UID,
    prompt_key: vector<u8>,
    content_blob_id: vector<u8>,
    metadata_blob_id: vector<u8>,
    parent_record_id: Option<ID>,
    parent_prompt_key: Option<vector<u8>>,
    root_prompt_key: vector<u8>,
    original_author: address,
    creator: address,
    fork_depth: u64,
    created_at_ms: u64,
}
```

Original creators get credit even after 100 generations of remixes. The attribution doesn't expire, can't be deleted, and doesn't depend on WalTube staying online.

---

### 3.3 Smart Royalties

**What traditional platforms do:** If your creative work inspires a thousand derivatives, you earn nothing from any of them. GitHub stars don't pay rent. Your original idea is free for everyone to monetize except you.

**What WalTube does:** Fork royalties route earnings automatically back through the attribution chain. When a forked prompt earns money — through paid likes or marketplace sales — a percentage flows back to every creator in its ancestry, enforced by the Move contract.

```
Original Creator → Fork 1 → Fork 2 → Fork 3
      ↑                ↑          ↑
   Gets 5%          Gets 3%    Gets 2%
   of everything    of Fork    of Fork
   downstream       2 & 3      3 earnings
```

The contract supports arbitrary multi-generational chains (e.g., 5% → 3% → 2% across three levels). The current MVP implements a 5% / 95% parent-to-creator split for every fork, with the full chain computation ready to roll out. Even in its simplest form, this is how music royalties work — except fully automated, with zero middlemen, and verified on a public blockchain. No label. No publisher. No platform taking a cut of the cut. The contract executes; money moves.

No platform in the AI creator space has this. Not CivitAI. Not PromptBase. Not anyone.

---

### 3.4 Walrus Storage — Permanent, Verifiable, Yours

**What traditional platforms do:** Your content lives on their servers. They can delete it, demonetize it, restrict it, or simply shut down. Vine had 200 million users. It's gone. Every creator who built there lost everything overnight.

**What WalTube does:** All media — prompt videos, workflow outputs, thumbnails, avatars — is stored on Walrus, Sui's decentralized blob storage protocol. Content is sharded across 100+ independent storage nodes. No single entity can delete it.

Every file gets a permanent blob ID derived from its content. If the content changes, the ID changes — tamper-proof by design. Anyone can fetch any blob by ID and verify it matches the onchain hash. Your portfolio doesn't belong to WalTube. It belongs to the network.

Practically: creators never think about any of this. They post. Their content becomes permanent. The infrastructure is invisible.

---

### 3.5 zkLogin — Web2 Onboarding, Web3 Ownership

**What traditional Web3 platforms do:** They ask you to install MetaMask, write down a 12-word seed phrase, buy ETH for gas, then figure out how to connect a wallet. 95% of mainstream creators bounce before they ever post anything.

**What WalTube does:** Sign in with Google. That's it. Behind the scenes, zkLogin (via Enoki) uses a zero-knowledge proof to derive a real Sui wallet address from the OAuth credential. No seed phrase. No browser extension. No crypto knowledge required. 45 seconds from landing page to first post.

Web2 creators get the UX they already know. Web3 creators get native wallet integration. Both groups get a fully functional Sui wallet they actually own — without the traditional onboarding friction that has killed every mainstream Web3 social attempt so far.

---

### 3.6 Workflow Cards — The Feature No Other Platform Has

**What traditional platforms do:** YouTube tutorials exist. Reddit threads exist. But there is no structured, interactive format for documenting multi-step AI generation pipelines. If you want to recreate someone's workflow, you're reading a wall of text and hoping you don't miss a step.

**What WalTube does:** Workflow Cards are multi-step, interactive tutorials that walk through complex AI pipelines step by step — e.g., "Generate a character image → Animate with Runway → Add lip-sync with Hedra → Color grade with DaVinci." Each step shows the input, the exact prompt, the model used, and the result.

This is the difference between a recipe and a photo of a finished meal. AI video creation is a multi-tool craft. Workflow Cards make that craft teachable, reproducible, and attributable. The creator who documents their pipeline owns that pipeline — onchain, permanently, with every fork credited back.

Workflow Cards can also be priced. A creator sets a SUI price on an advanced card, and the steps stay encrypted and locked until that price is paid — see 3.9 for how that's enforced without anyone, including WalTube, having to be trusted.

---

### 3.7 The Fork System

**What traditional platforms do:** Remixing is informal. You screenshot, copy, repost. The original creator is invisible. There's no lineage, no credit, no way to measure influence.

**What WalTube does:** Forks are a first-class action. One tap creates a new prompt with the original creator's attribution baked in — not as a courtesy, but as an onchain record. The fork tree is visible on every prompt. Creators can see exactly how their work has spread and evolved across the network.

Combined with smart royalties, the fork system turns creative influence into measurable, monetizable value. The more your work gets remixed, the more you earn from every branch of the tree.

---

### 3.8 Prompt Cards — The Atomic Unit

The base building block of WalTube. Every Prompt Card contains the video output, the exact prompt text, the AI model used, style tags, mood label, difficulty level, and camera notes. One-tap copy. One-tap fork. One-tap tip.

This is the format that doesn't exist anywhere else: a structured, attributable, monetizable post specifically designed for AI-generated content. Not a tweet. Not a YouTube video. Not a GitHub gist. Something built for this medium from the ground up.

---

### 3.9 Premium Workflow Cards — Seal-Encrypted Paywalls

**What traditional platforms do:** A Patreon-style paywall is a database flag. If you've paid, a server checks a row in a table and serves you the content. That check lives entirely inside the platform's backend — meaning the platform itself, or anyone with admin access to it, can always see (or leak, or override) what's supposed to be locked. The "wall" is enforced by trust, not by cryptography.

**What WalTube does:** Creators can mark a Workflow Card as Premium and set their own SUI price. The card's step content — prompts, parameters, technique notes — is encrypted before it's published to Walrus, using Seal, Sui's decentralized threshold identity-based encryption (IBE) protocol. The decryption key for that content is never held by WalTube. Instead, Seal's independent key servers will only release the key shares needed to decrypt once they can verify, onchain, that the buyer paid the creator's price. Pay the price → the card decrypts in the buyer's browser. Don't pay → the content is cryptographically inaccessible, full stop — not gated by a server check WalTube could quietly bypass.

This is what turns Workflow Cards from a teaching format into a real product: a creator's signature pipeline — the exact sequence that produces their style — becomes something they can sell directly, enforced by encryption rather than by asking buyers (or WalTube) to play fair.

Technical: Encryption/decryption handled client-side via `@mysten/seal`. Payment is verified onchain before Seal's key servers will cooperate to reconstruct a decryption key for that specific card.

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

Every Web3 social app before WalTube lost mainstream creators at the wallet setup screen. zkLogin eliminates that. Signing up means signing in with Google — 45 seconds from landing page to first post, with a real Sui wallet created invisibly in the background.

The onboarding flow is 3 steps: pick a handle, select your AI models, follow top creators.

Enoki also powers sponsored transactions — scoped to royalty payouts and attribution writes. Creators and forkers never pay gas for those onchain records; WalTube covers it on the backend.

### 4.3 Backend / Data Layer

| Service | Purpose |
|---------|---------|
| **Firebase Firestore** | Social graph (users, follows, likes, saves, copies, notifications, collections) |
| **Walrus** | Decentralized media storage (videos, thumbnails, avatars, workflow media, Seal-encrypted premium content) |
| **Sui Blockchain** | Onchain attribution records (Move contracts), SUI tipping, zkLogin identity, premium card payment records |
| **Seal** | Threshold IBE encryption for Premium Workflow Card content — decryption gated by onchain payment verification |
| **Enoki** | zkLogin wallet derivation + sponsored transaction backend (gasless royalty payouts and attribution writes) |

Firebase handles high-frequency, low-stakes social actions (likes, saves, copies) with sub-second latency. Sui handles high-value, irreversible actions (forks with attribution, paid likes, storage blob ownership, premium content payment gating).

### 4.4 Smart Contracts

| Contract | Purpose |
|----------|---------|
| **`cuerate_attribution`** | Records `AttributionRecord` objects onchain for every prompt and fork. Tracks original author, fork depth, parent record, and timestamp. |
| **`waltube_royalties`** | Creates per-prompt `RoyaltyConfig` objects and atomically splits SUI payments across multiple recipients. `receive_payment` distributes to all configured recipients in a single transaction. |
| **Paid Like Tipping** | Wallet-to-wallet SUI transfers on every like (direct transfer fallback when no royalty config exists). |
| **Premium Card Access Control** | Records onchain payment for a priced Workflow Card. This record is the access policy Seal's key servers check before cooperating to release decryption key shares for that card's content. |

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

- **Fully responsive** — Optimized across all devices, mobile through desktop
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

## 6. Why WalTube Wins

| | Instagram / TikTok | CivitAI / PromptBase | **WalTube** |
|---|---|---|---|
| Attribution | None | Manual / honor system | Cryptographic, onchain, forever |
| Content permanence | Centralized, deletable | Centralized, deletable | Walrus — 100+ nodes, immutable |
| Monetization | Ad revenue share, algorithm-gated | Marketplace fees, platform cut on tips | Direct wallet-to-wallet, zero platform fee |
| Remix earnings | Zero | Zero | Smart royalties — automatic, multi-generational |
| Onboarding | Email/phone | Email/wallet | zkLogin — Google sign-in, 45 seconds |
| Content format | Generic video/image posts | Model images, static prompts | Video-first Prompt Cards + Workflow Cards |
| Premium content gating | Centralized paywall — server decides access | Centralized paywall / escrow | Seal-encrypted, onchain payment-gated — not even WalTube can bypass it |
| Web3 native | No | Partial | Yes — Walrus, Sui, zkLogin are load-bearing |

### The Single Sentence That Matters

YouTube knows what you earn and takes 45%. On WalTube, the blockchain knows what you earn and takes 2%. The rest is yours — automatically, instantly, forever.

### Why No One Else Has Built This

The three technologies that make WalTube possible — Walrus permanent storage, Sui sub-cent transactions, and zkLogin frictionless onboarding — are all new. The window to build the definitive creator platform on this stack is open right now. It won't stay open.

### On the Architecture Tradeoff

Firebase handles high-frequency social actions (likes, saves, copies, follows) with sub-second latency. Walrus handles what actually matters — permanent media and verifiable blob ownership. This is a deliberate tradeoff: centralize low-stakes, high-frequency data; decentralize high-value, irreversible data. It's the correct call for this stage, and it's honest about what "decentralized" means in practice.

---

## 7. Track Fit

**Primary track:** Entertainment and Culture

**Secondary justifications:**
- **Programmable Storage** — Walrus-native media storage, Seal-encrypted premium content
- **Payments and Wallets** — SUI creator tipping, zkLogin onboarding, sponsored gasless royalty/attribution transactions, Seal payment-gated premium unlocks
- **AI** — AI metadata generation, prompt marketplace concept

---

## 8. Roadmap

What's live now is the foundation. What's coming is where the business gets interesting.

### V1 — Usage-Based Storage (Post-Hackathon)

Per-GB annual pricing launches. Every user starts with 2GB free permanently. First paid plan at $0.99/year covering 3GB total. Every additional GB adds $0.50/year. Subscriptions only go up as content grows. Full inactivity policy enforced — six months no posts, two warnings, epochs stop at day 50.

### V2 — Prompt Marketplace

Creators list their best prompts at fixed SUI prices. Buyers receive a verified onchain copy. Platform takes 5% per sale. Every downstream fork of a purchased prompt still routes royalties back to the original creator automatically. This is the primary revenue line beyond storage.

### V3 — In-App Fiat Offramp

Creators earn in SUI. Most creators live in the real world. In-app offramping lets creators convert earnings directly to fiat without leaving the platform — no CEX account, no manual bridging, no friction. This is the feature that makes WalTube viable for creators who are not crypto-native. The details of the financial architecture are still being finalized, but the integration point is clear: earnings should be spendable wherever the creator needs them.

### V3.5 — Brand & Studio Discovery Layer

Every creator's onchain portfolio — prompts posted, forks generated, models mastered, engagement earned — becomes a structured, searchable talent profile. Brands and studios looking for AI video creators for commercial work can filter by model expertise, aesthetic style, fork influence, and verified output quality.

This is a B2B revenue layer on top of the creator platform. A brand pays to access verified creator profiles and reach out directly. The creator owns their portfolio — it can't be deleted, can't be falsified, and doesn't depend on follower count to demonstrate skill. The best creators get found by the jobs that match them, not by whoever has the largest audience.

### V4 — Direct Generation In-App

Partner integrations with Kling, Runway, and Pika APIs. Creators generate directly inside WalTube using generation credits. The margin on credits subsidizes free-tier storage at scale. This closes the loop: discover a workflow, generate from it, publish it, earn from it — all in one place. This is the Series A story.

### V5 — Creator Subscriptions

Followers pay monthly SUI to access premium prompts, private workflows, and early drops. Fully onchain. Platform takes 5%. Think Patreon — but the payments are transparent, the creator owns the relationship, and the platform can never demonetize them.

### Future Integrations

**Paid Like Platform Fee** — Paid likes currently route 100% directly to creators with zero platform cut. This is intentional — it builds trust and removes friction at the most critical early stage. A small platform fee on paid likes may be introduced later once the creator economy on WalTube is self-sustaining, funded by volume rather than percentage.

**Sponsored Sui Transactions — Live for Royalties & Attribution.** Sponsored transactions are already live for two flows: royalty distribution payouts and attribution record writes. WalTube absorbs the gas fee through Sui's sponsored transaction feature (via Enoki), so forking a prompt and routing royalties back through the chain costs creators and forkers nothing in gas. Expanding sponsorship to the rest of WalTube's onchain actions — paid likes, premium card purchases — is the next step toward making every action on the platform completely invisible from a gas perspective. Zero gas prompts. Zero crypto knowledge required. The full Web2 experience with full Web3 ownership underneath.

---

## 9. Proposed Financial Model

### Free Tier

Every creator who joins WalTube gets 2GB of permanent, decentralized storage — free, for as long as their account is active.

This is not a trial. It is not a 30-day promotion. It is a genuine commitment to every creator who chooses this platform.

Why do we do this? Because the entire value proposition of WalTube depends on creators trusting us with their work. A creator who posts their best prompts here needs to know that content is safe — not conditionally safe, not safe until we change our minds, but permanently safe. The 2GB free tier is how we prove that from day one, before they spend a single dollar.

It also removes every barrier to entry. No credit card. No plan selection. No crypto wallet setup. Sign in with Google, start posting, your content is permanent immediately. That frictionless first experience is what converts curious visitors into committed creators.

The cost to WalTube for this commitment is $0.046 per user per month — less than 5 cents. At any scale, this is one of the cheapest trust-building investments any platform can make.

Cumulative upload tracking ensures the free tier cannot be abused — deleting content never resets the counter. The 2GB is a lifetime upload allowance, not a current storage reading.

---

### Usage Costs

- First plan: **$0.99/year** (3GB total usage)
- Every additional GB: **+$0.50/year**
- Usage costs only go up as your content grows, never forced down

The first plan is priced to feel like nothing — less than a dollar a year. Under the hood it silently recovers the cost of the creator's free tier while adding their first paid GB on top. To the user it simply feels like a fair, transparent storage fee.

Every GB added after that costs $0.50/year. The more a creator posts, the more storage they need, the more their annual cost grows — but so does their earning potential from paid likes, marketplace sales, and fork royalties. For an active creator, storage costs become invisible against their earnings.

---

### Inactivity Policy

- Inactive = no posts for 6 months, for any reason
- Month 6: first warning sent
- Month 6 + Day 25: second warning sent
- Month 6 + Day 50: epochs stop, content expires naturally on Walrus

Six months is deliberately generous. AI video creators work in bursts — some disappear for weeks then post prolifically. The inactivity clock only starts after 6 months of complete silence. Two warnings are sent before anything happens. Content does not get deleted — WalTube simply stops paying Walrus epoch renewals, and the content expires naturally on the network.

This policy protects the platform from carrying the storage costs of abandoned accounts indefinitely, while giving every genuine creator more than enough time to return.

---

### User-Facing Explanation

*"Your usage costs are calculated annually based on what you have on WalTube. More content, higher costs. Delete content, costs go down. Don't renew, your content expires. Simple."*

---

## 10. Team & Vision

WalTube is built for the next generation of AI creators — the people who are right now figuring out how to make Sora produce cinematic masterpieces, how to chain Runway + Kling + Hedra into professional workflows, and how to build audiences around their creative process.

The creator economy is a $250B market built almost entirely on platforms that extract value from creators while giving them the minimum necessary to stay. WalTube is built on the opposite principle: every dollar a creator earns is visible on a public blockchain, every remix of their work pays them automatically forever, and no algorithm decides what they're worth.

The infrastructure is already here. Walrus gives us permanent storage. Sui gives us sub-second finality and sub-cent transactions. zkLogin gives us mainstream onboarding. WalTube connects all three into a product that AI creators actually want to use — and that pays them in a way no platform ever has.

---

*Built with React, Tailwind CSS, Firebase, Sui, Walrus, Seal, and Enoki (zkLogin + sponsored transactions).*

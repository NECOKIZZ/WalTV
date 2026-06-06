# Cuerate × Sui Overflow Hackathon Strategy
### A Complete Web3 Integration Playbook

---

## Executive Summary

Cuerate is a mobile-first social platform for AI video creators — think Instagram × GitHub for AI-generated content. It currently has no Web3 integrations. This document outlines a full hackathon strategy to transform Cuerate into a Sui-native dApp, aligned with what judges have consistently rewarded across Sui Overflow 2024 and 2025.

**The core pitch:** *Cuerate is the first decentralized social layer for AI-generated content, where every prompt is an onchain creative asset, every remix is an immutable attribution record, and every creator gets paid fairly — powered by Sui and Walrus.*

---

## Hackathon Strengths

### ✅ What Cuerate Already Gets Right

**1. Real user problem, not a crypto-first problem**
Cuerate solves a genuine creator problem — AI prompt creators have no proper attribution system, no monetization layer, and no portable identity. Judges from both hackathon years consistently rewarded projects that solve real problems for real users, not just "DeFi for DeFi's sake."

**2. Aligns with Sui's mass adoption thesis**
Sui's stated goal is to be the first blockchain built for mass adoption. A social platform targeting the exploding AI creator economy (millions of Sora, Runway, Kling users) is perfectly positioned. The Entertainment and Culture track was the most competitive in 2025 — Cuerate would fit there while also qualifying for Programmable Storage and potentially AI.

**3. The Fork/Copy system is naturally onchain**
Git-like forking with attribution chains is one of those rare ideas that is *better* onchain than offchain. Immutable attribution, transparent remix history, and verifiable creator stats are things a blockchain is purpose-built for. Judges love when the Web3 integration is load-bearing, not decorative.

**4. Multi-track eligibility**
Cuerate can credibly compete in:
- **Entertainment and Culture** (primary) — social platform for creators
- **Programmable Storage** — Walrus for video/prompt storage
- **AI** — AI metadata generation + onchain AI asset marketplace

Winning or placing in multiple track discussions significantly increases judging visibility.

**5. Strong design and UX foundation**
The glassmorphism, mobile-first design is polished. Judges noted in both years that UX quality matters — projects that hide blockchain complexity behind clean interfaces score higher.

---

## Hackathon Weaknesses & How to Solve Them

### ❌ Flaw 1: No Web3 Integrations Yet

**The problem:** Judges expect meaningful, non-trivial Sui integration. A project that "just added a wallet button" will not place.

**The fix:** Implement at least 3 of the 5 core integrations outlined below before Demo Day. Prioritize Walrus storage (Programmable Storage track) and the onchain attribution/fork system (Entertainment and Culture track) as your two anchor integrations.

---

### ❌ Flaw 2: No Monetization Layer

**The problem:** Instagram and TikTok are famously bad at paying creators. Cuerate risks being the same. Judges are investors — they look for sustainable tokenomics, not just cool UX.

**The fix:** Implement creator tipping via SUI tokens + a future-facing prompt marketplace concept. Even a basic tipping flow with a clear roadmap to a full marketplace is enough for Demo Day.

---

### ❌ Flaw 3: No User Identity Portability

**The problem:** Currently, a Cuerate user's identity (handle, followers, stats, reputation) lives in Firebase and is owned by the platform. This is a Web2 problem that Web3 solves natively.

**The fix:** Integrate zkLogin for social onboarding (no wallet required) + SuiNS for onchain handles. A user's Cuerate identity becomes portable across all Sui apps.

---

### ❌ Flaw 4: Centralized Storage = Single Point of Failure

**The problem:** Storing AI-generated video prompts and metadata in Firebase/Supabase means Cuerate can censor content, go offline, or lose data. This contradicts the "open-source for prompts" thesis.

**The fix:** Walrus decentralized storage for all prompt text, metadata, and thumbnails. This is the most compelling single integration for the hackathon because it directly qualifies for the Programmable Storage track.

---

### ❌ Flaw 5: Fork Attribution Has No Enforcement

**The problem:** Currently, the forking system is honor-based. Anyone can copy a prompt and claim it as their own because there's no immutable record.

**The fix:** Every fork creates an onchain record via a Sui Move smart contract. The attribution chain becomes tamper-proof and visible to anyone.

---

## The Five Core Integrations

---

### Integration 1: Walrus Decentralized Storage
**Replaces:** Firebase Storage / Supabase

#### What it does technically
Walrus is Sui's decentralized blob storage protocol. Instead of uploading video thumbnails and prompt metadata to Firebase, Cuerate uploads them to the Walrus network. Each file gets a permanent, content-addressed blob ID that is stored onchain. The file lives across multiple storage nodes — no single company can delete or censor it.

**Implementation:**
- Replace `firebase.storage` upload calls with Walrus publisher API
- Store returned `blobId` in Firestore (or onchain) as the canonical reference
- Retrieve via Walrus aggregator URL: `https://aggregator.walrus-testnet.walrus.space/v1/{blobId}`
- Use Walrus for: prompt text blobs, thumbnail images, workflow step media

**Relevant track:** Programmable Storage (dedicated track with 4 prize slots)

#### Why it's good for Cuerate
Prompt creators care deeply about their work being permanent and uncensorable. A prompt that goes viral shouldn't disappear because a startup runs out of money. Walrus gives Cuerate a credible "your prompts live forever" promise that no Web2 competitor can match. It also makes every prompt verifiable — anyone can confirm the content hasn't been altered since publication.

#### Layman's explanation
Right now, Cuerate stores prompts on company servers — like keeping your diary in a rented apartment. If the company shuts down or deletes your account, your prompts are gone. Walrus is like carving your prompts into a thousand different stones scattered across the world. No one can delete them all, and anyone can verify they haven't been changed.

---

### Integration 2: Onchain Fork Attribution via Sui Move
**Adds to:** The existing Fork/Copy system

#### What it does technically
Deploy a Sui Move smart contract that records every fork event onchain. When User B forks User A's prompt, a Move object is created with:
- `originalPromptId` (blob ID on Walrus)
- `originalAuthorAddress`
- `forkAuthorAddress`
- `timestamp`
- `forkDepth` (how many generations removed from the original)

This creates an immutable, traversable attribution chain. The contract can also track cumulative fork royalty percentages if a marketplace is added later.

**Move object structure (simplified):**
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

**Relevant track:** Entertainment and Culture, Advanced Move Features

#### Why it's good for Cuerate
This is the integration that transforms Cuerate from "Instagram for AI prompts" into a fundamentally new category: a creative commons with provable lineage. Every viral prompt has a visible ancestry. Original creators get permanent, cryptographic credit even after 100 generations of remixes. This is the kind of feature that press covers and judges remember.

#### Layman's explanation
Today, if someone copies your AI prompt and it goes viral, there's no proof you made it first. This integration is like a permanent copyright notice that writes itself automatically every time someone remixes your work — except it's carved into a global ledger that no one can erase or dispute. Think of it like a family tree for prompts.

---

### Integration 3: zkLogin for Frictionless Onboarding
**Replaces:** Firebase Auth (Google OAuth, Email link)

#### What it does technically
zkLogin is a Sui primitive that lets users log in with their existing Google, Apple, or Facebook account and automatically generates a Sui wallet address — no seed phrase, no browser extension. Behind the scenes, a zero-knowledge proof verifies the OAuth credential without exposing the user's identity to the blockchain.

**Implementation:**
- Replace `signInWithGoogle()` Firebase call with zkLogin OAuth flow
- User's Sui address is derived from their OAuth subject identifier
- All subsequent onchain actions (forks, tips, saves) are signed with this address
- No user ever sees a private key during normal app use

**Relevant track:** The 2024 hackathon had a dedicated zkLogin track. In 2025 it was embedded across tracks as a UX quality signal.

#### Why it's good for Cuerate
Cuerate's target users are AI creators — not crypto natives. They use Midjourney, Runway, and Sora. Asking them to install MetaMask and write down a seed phrase is a conversion killer. zkLogin means the onboarding flow stays exactly as it is today (Sign in with Google), but the user secretly has a full Sui wallet. Web3 is invisible until they need it.

#### Layman's explanation
Normally, getting a crypto wallet is like getting a Swiss bank account — complicated paperwork and a secret code you must never lose. zkLogin means Cuerate users just tap "Sign in with Google" like they always would, and they automatically get a crypto wallet in the background, invisibly. They don't need to know it's there until someone wants to tip them.

---

### Integration 4: SUI Creator Tipping + Prompt Marketplace
**Adds:** Direct monetization layer

#### What it does technically
**Tipping (MVP for Demo Day):**
- Add a "Tip Creator" button on every PromptCard
- Integrate `@mysten/dapp-kit` for wallet connection
- Execute a simple `transferObjects` transaction to send SUI from tipper to creator's address
- Update prompt's `tips` counter in Firestore/Walrus

**Prompt Marketplace (roadmap item, concept demonstrated):**
- Prompts can be listed at a fixed SUI price
- "Buy" creates an onchain transfer + grants the buyer a verified copy NFT
- Forking a purchased prompt automatically routes a percentage back to the original creator via the Move contract

**Relevant track:** Entertainment and Culture, Payments and Wallets

#### Why it's good for Cuerate
This is the answer to "how do creators make money?" — the most important question for any creator platform. Every major creator platform (YouTube, Substack, Patreon) built monetization years after launch and struggled to retrofit it. Cuerate has the opportunity to bake it in from day one, and the tipping UX is simple enough to implement in a hackathon sprint. The future marketplace concept also gives judges a credible growth story.

#### Layman's explanation
Right now, if someone loves your AI prompt and it helps them create something incredible, there's no way to pay you for it. This integration adds a tip jar to every prompt — just like tipping a musician on the street, except it goes directly to the creator with no middleman taking a cut. In the future, it becomes a full marketplace where creators can sell their best prompts like digital products.

---

### Integration 5: SuiNS Onchain Identity
**Adds to:** User profile system

#### What it does technically
SuiNS (Sui Name Service) is Sui's equivalent of ENS — a registry where users can claim human-readable names like `@vee.sui` that resolve to their Sui address. Cuerate integrates SuiNS so that:
- A user's Cuerate handle can optionally be their SuiNS name
- Tipping someone by their handle resolves to their address automatically
- Profile links become portable (`@vee.sui` works in Cuerate, other Sui apps, and any future platform)
- Verified SuiNS names get a badge on their profile

**Relevant track:** Entertainment and Culture, Payments and Wallets

#### Why it's good for Cuerate
Identity portability is a core Web3 value proposition. A creator who builds a reputation on Cuerate should own that reputation — not lease it from a company. SuiNS makes a creator's handle a permanent digital asset they control. It also creates a natural network effect: users who already have SuiNS names will want to connect them to Cuerate, and Cuerate users will want SuiNS names to become portable.

#### Layman's explanation
Today, your Cuerate username belongs to Cuerate the company. If the app shuts down, your reputation disappears with it. SuiNS is like having a custom domain name for your identity — you own it, it never expires as long as you keep it, and it works everywhere in the Sui ecosystem, not just on Cuerate. Your `@name.sui` is yours forever.

---

## Recommended Integration Priority for Hackathon

| Priority | Integration | Track Benefit | Development Effort |
|----------|------------|---------------|-------------------|
| 🔴 Must Have | Walrus Storage | Programmable Storage (dedicated track) | Medium |
| 🔴 Must Have | Onchain Fork Attribution | Entertainment & Culture anchor | High |
| 🟡 Should Have | zkLogin Onboarding | UX quality signal, reduces friction | Medium |
| 🟡 Should Have | SUI Creator Tipping | Monetization story, Payments track | Low-Medium |
| 🟢 Nice to Have | SuiNS Identity | Identity portability, completeness | Low |

---

## Demo Day Narrative

**The three-sentence pitch:**

*"Every day, millions of AI creators share prompts with no attribution, no monetization, and no permanence. Cuerate solves all three — it's the first social platform where your AI prompts live forever on Walrus, every remix creates an unbreakable credit chain on Sui, and creators get paid directly by fans. Sign in with Google, start sharing, and earn — no crypto knowledge required."*

**The live demo flow (5 minutes):**
1. Sign in with Google via zkLogin — no wallet setup visible
2. Post a prompt — metadata stored on Walrus, hash recorded onchain
3. Fork someone's prompt — Move contract creates attribution record
4. Tip a creator — SUI transferred directly, no platform cut
5. Show the attribution chain — 3 generations of a viral prompt, all traceable

---

## Track Submission Recommendation

**Primary track:** Entertainment and Culture
**Secondary justification in submission:** Programmable Storage (Walrus), Payments (tipping)

The Entertainment and Culture track in 2025 attracted the most submissions and produced the highest visibility winners. GiveRep (1st place) won by combining AI, blockchain, and social engagement on X — Cuerate's pitch is the same formula applied to the AI creator economy.

---

## Competitive Edge vs. Other Likely Entries

Most Entertainment and Culture entries will be NFT games, onchain music platforms, or social reputation tools. Cuerate is differentiated because:

1. **AI angle** — directly relevant to the second-most popular track category
2. **Creator tooling** — not just consumption but creation infrastructure
3. **Multi-primitive depth** — Walrus + Move + zkLogin + SuiNS in one coherent product
4. **African builder resonance** — VibeTrax (Nigeria) and DeepLayr (Abeokuta) proved African builders solving local-but-global problems resonate with judges. Creator monetization without upfront capital is deeply relevant in the Nigerian/West African market, and judges have noted this framing positively.

---

## Summary: What Each Integration Brings

| Integration | Core Value | Sui Primitive Used |
|-------------|-----------|-------------------|
| Walrus Storage | Permanent, censorship-resistant prompts | Walrus |
| Onchain Forks | Tamper-proof creative attribution | Move smart contracts |
| zkLogin | Frictionless Web3 onboarding | zkLogin |
| Creator Tipping | Direct creator monetization | SUI transfers, dapp-kit |
| SuiNS Identity | Portable, user-owned reputation | SuiNS |

---

*Document prepared for Sui Overflow Hackathon 2025/2026 submission strategy.*
*Based on analysis of Sui Overflow 2024 and 2025 winner patterns.*

N/B: zkLogin + existing SuiNS wallet: Yes, they work together, but there's a nuance. zkLogin generates a new Sui address derived from your Google/Apple OAuth credential. If you already have a hardware/extension wallet with a SuiNS name like vee.sui, that address is different from your zkLogin address. The solution is wallet linking — you let users connect their existing wallet (Slush, Sui Wallet extension) instead of zkLogin, and SuiNS resolution works natively. zkLogin becomes the fallback for users who don't have a wallet yet. So the onboarding flow becomes: "Do you have a Sui wallet? Connect it. Don't have one? Sign in with Google." This is actually the better product decision anyway — power users bring their identity, new users get one created invisibly.
Likes, copies, saves onchain: You're right to avoid this. Here's the logic — these are high-frequency, low-stakes actions. Putting them onchain means every like costs gas, requires a wallet signature, and adds latency to what should be an instant tap. Even the most onchain-native social platforms (Lens Protocol, Farcaster) keep engagement metrics offchain or in a hybrid layer. Keep likes, saves, and copies in Firebase/Firestore exactly as they are. The onchain layer should only touch things that are irreversible and high-value — forks with attribution, tips, and storage blobs.
Micropayments on likes — this is the killer feature. What you're describing is essentially a "proof of appreciation" micro-tip — 0.001 SUI per like, flowing directly wallet-to-wallet. This is genuinely novel and judges will love it because it solves the creator economy problem in a concrete, demonstrable way. Let me think through the architecture with you properly before we build anything
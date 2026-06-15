# Seal Premium Workflows — Implementation Plan

## 1. Overview

A new **Premium Workflow** card type where all internal content (prompts, parameters, intermediate images, step results) is encrypted by Seal and only decryptable after a one-time SUI payment. The output/cover video remains visible as a free preview. Premium workflows are not forkable but can be saved (bookmarked).

## 2. Product Decisions

| Decision | Choice |
|---|---|
| What is gated | All `steps[]` data: promptText, note, inputImageUrl, startFrameUrl, endFrameUrl, ingredientsImageUrls, resultMediaUrl, resultThumbnailUrl for every step |
| What is visible for free | Cover thumbnail, cover video (hover/playable), title, description, tags, step count, step labels, model names, creator info, likes count |
| Unlock pricing | Creator sets price at post time (input in SUI, stored as `unlockPriceMist`) |
| Unlock model | One-time payment = permanent access for that user |
| Platform fee | 10% to platform, 90% to creator |
| Gas for unlock | User-paid (viewer pays gas), NOT sponsored |
| Forkable | No — premium workflows are NOT forkable |
| Saveable | Yes — users can bookmark before/after unlocking |
| Paid likes | Yes — reuses existing `sendRoyaltyPayment` on workflows |
| Feature flag | `VITE_ENABLE_PREMIUM_WORKFLOWS` (default true in dev) |

## 3. Data Model Changes

### `Workflow` type (`src/lib/types.ts`)

```typescript
export interface Workflow {
  id: string;
  authorUid: string;
  authorHandle: string;
  authorAvatar: string;
  title: string;
  tool: string;
  description: string;
  coverVideoUrl: string;
  coverThumbnailUrl: string;
  tags: string[];
  stepCount: number;
  likes: number;
  saves: number;
  mediaAspectRatio: PromptAspectRatio;
  createdAt: Date;
  steps: WorkflowStep[];

  // NEW — Premium fields
  isPremium?: boolean;
  unlockPriceMist?: string;         // e.g. "500000000" for 0.5 SUI
  sealEncryptedBlobId?: string;    // Walrus blob ID of encrypted steps payload
  sealAccessPolicyId?: string;     // Sui object ID of Seal access policy
  sealCreatorKeyId?: string;       // Reference to creator's encryption key
}
```

### `WorkflowCreateInput` type

```typescript
export interface WorkflowCreateInput {
  authorUid: string;
  title: string;
  tool: string;
  description: string;
  coverVideoUrl: string;
  coverThumbnailUrl: string;
  tags: string[];
  mediaAspectRatio?: PromptAspectRatio;
  steps: WorkflowStepCreateInput[];

  // NEW
  isPremium?: boolean;
  unlockPriceMist?: string;
}
```

### `WorkflowUnlockRecord` (new Firestore collection)

```typescript
export interface WorkflowUnlockRecord {
  id: string;              // `${userId}_${workflowId}`
  userId: string;
  workflowId: string;
  creatorUid: string;
  amountMist: string;
  txDigest: string;
  paidAt: Date;
}
```

## 4. Seal Architecture

### What is Seal?

Seal is Sui's threshold encryption primitive. It lets a creator encrypt data, store it anywhere, and define an on-chain access policy that controls who can request the decryption key. A Seal service (run by Mysten or self-hosted) verifies the on-chain policy and returns the decryption key only to authorized parties.

### Flow: Create Premium Workflow

```
Creator posts premium workflow
  |
  ├─> 1. Generate random AES-256-GCM key in browser
  |
  ├─> 2. Encrypt the full steps[] JSON payload with this key
  |      → ciphertext + iv + tag
  |
  ├─> 3. Upload encrypted blob to Walrus
  |      → get sealEncryptedBlobId
  |
  ├─> 4. Create Seal Access Policy on Sui
  |      → "anyone can decrypt after paying unlockPriceMist to creator"
  |      → policy object ID = sealAccessPolicyId
  |
  ├─> 5. Store the key reference (not the raw key) with the policy
  |      → sealCreatorKeyId
  |
  └─> 6. Save workflow doc to Firestore
         → steps[] is EMPTY or contains only non-sensitive metadata
         → sealEncryptedBlobId, sealAccessPolicyId stored on doc
```

### Flow: View Premium Workflow

```
User clicks workflow card
  |
  ├─> Cover video plays (free preview)
  |
  ├─> Steps section shows LOCKED state
  |      → Step labels visible ("Step 1: Prompt to video")
  |      → Prompt text blurred/replaced with lock icon
  |      → Images show lock overlay
  |
  ├─> User clicks "Unlock for X SUI"
  |      |
  |      ├─> Check if already unlocked (Firestore `workflow_unlocks`)
  |      |      → If yes, fetch encrypted blob and decrypt locally
  |      |
  |      └─> If not unlocked:
  |             1. Show payment confirmation
  |             2. Build Sui transaction: transfer unlockPriceMist to creator
  |             3. Sign & execute (user-paid gas)
  |             4. On success, call Seal service:
  |                POST /v1/access-policy/{policyId}/request-key
  |                { txDigest: "...", payerAddress: "0x..." }
  |             5. Seal service verifies tx on-chain, returns AES key
  |             6. Fetch encrypted blob from Walrus by blobId
  |             7. Decrypt locally in browser
  |             8. Store `WorkflowUnlockRecord` in Firestore
  |             9. Render decrypted steps[]
```

## 5. Files to Create / Modify

### New Files

| File | Purpose |
|---|---|
| `src/lib/seal.ts` | Seal SDK wrapper: `encryptSteps()`, `decryptSteps()`, `createAccessPolicy()`, `requestDecryptionKey()` |
| `src/lib/seal-payments.ts` | Unlock payment flow: `sendUnlockPayment()` transfers SUI from viewer to creator |
| `src/app/components/PremiumWorkflowCard.tsx` | Card variant with lock badge, price tag, gated preview |
| `src/app/components/PremiumWorkflowDetail.tsx` | Detail view with unlock gate overlay, payment flow |

### Modified Files

| File | Changes |
|---|---|
| `src/lib/types.ts` | Add `isPremium`, `unlockPriceMist`, `sealEncryptedBlobId`, `sealAccessPolicyId` to `Workflow` and `WorkflowCreateInput` |
| `src/lib/backend.ts` | Add `workflowUnlocksApi`: `isUnlocked(userId, workflowId)`, `recordUnlock(record)`; Add premium fields to `createWorkflow()` |
| `src/lib/sui-payments.ts` | Add `sendUnlockPayment()` helper (similar to `sendSuiPayment` but with metadata) |
| `src/app/screens/Post.tsx` | Add premium toggle + price input in workflow creation form; wire Seal encryption before saving |
| `src/app/components/WorkflowCard.tsx` | Show lock icon + price for premium workflows; hide step previews |
| `src/app/screens/WorkflowDetail.tsx` | Add unlock gate UI; decrypt and render steps after unlock; hide copy-all-prompts until unlocked |
| `src/app/screens/Feed.tsx` | Filter/sort premium workflows; wire unlock flow |
| `.env` | Add `VITE_ENABLE_PREMIUM_WORKFLOWS=true` |

## 6. UI/UX Specification

### Premium Workflow Card (Feed View)

```
┌─────────────────────────────┐
│ [Cover Video - autoplay on  │
│  hover, same as normal]     │
│                             │
│  🔒 PREMIUM                 │  ← lock badge top-right
│  0.5 SUI                    │  ← price tag bottom-right
│                             │
├─────────────────────────────┤
│ Title of workflow           │
│ @creator • 3 steps          │  ← step count visible
│ ❤ 42  🔖 12                 │
└─────────────────────────────┘
```

Clicking card opens detail view.

### Premium Workflow Detail (Locked State)

```
┌─────────────────────────────┐
│ Back      Workflow thread   │
├─────────────────────────────┤
│ Title                       │
│ 3 step workflow             │
│                             │
│ [Cover Video — free,        │
│  autoplay/controls]         │
│                             │
│ Save | Like (42)            │
├─────────────────────────────┤
│ Step 1: Prompt to video      │
│ ┌─────────────────────────┐ │
│ │ 🔒                      │ │
│ │ Unlock to view prompt   │ │
│ │ and step details        │ │
│ │                         │ │
│ │ [Unlock for 0.5 SUI]    │ │
│ └─────────────────────────┘ │
│                             │
│ Step 2: Image to video     │
│ ┌─────────────────────────┐ │
│ │ 🔒                      │ │
│ │ Unlock to view prompt   │ │
│ └─────────────────────────┘ │
│                             │
│ Step 3: Frames to video    │
│ ┌─────────────────────────┐ │
│ │ 🔒                      │ │
│ │ Unlock to view prompt   │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

### Premium Workflow Detail (Unlocked State)

Same as current `WorkflowDetail.tsx` — all steps fully rendered with prompts, images, videos, copy buttons. No visual difference from a normal workflow once unlocked.

### Workflow Creation Form (Post.tsx)

Add a toggle switch:
```
[ ] Make this a Premium Workflow
    Price to unlock: [ 0.5 ] SUI
    
    ℹ️ All step prompts, images, and parameters
    will be encrypted. Only the cover video
    will be visible for free.
```

## 7. Seal SDK Integration Details

### Package
```bash
npm install @mysten/seal
```

### Key APIs (tentative — verify exact names in installed package)

```typescript
// src/lib/seal.ts

import { SealClient, Session } from '@mysten/seal';

interface EncryptedPayload {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  tag: Uint8Array;
}

/**
 * Encrypt workflow steps locally before uploading to Walrus.
 */
export async function encryptWorkflowSteps(
  steps: WorkflowStep[],
): Promise<{ encryptedData: Uint8Array; keyId: string }> {
  // 1. Generate AES-256-GCM key
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );

  // 2. Export raw key bytes for Seal policy registration
  const keyBytes = new Uint8Array(await crypto.subtle.exportKey('raw', key));

  // 3. Serialize steps to JSON
  const plaintext = new TextEncoder().encode(JSON.stringify(steps));

  // 4. Encrypt with AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  );

  // 5. Combine iv + ciphertext into single blob
  const encryptedData = new Uint8Array(iv.length + ciphertext.byteLength);
  encryptedData.set(iv, 0);
  encryptedData.set(new Uint8Array(ciphertext), iv.length);

  // 6. Return encrypted blob + key reference
  // The key itself is NOT stored locally; it's registered with Seal service
  const keyId = await registerKeyWithSeal(keyBytes);

  return { encryptedData, keyId };
}

/**
 * Decrypt workflow steps after user has unlocked.
 */
export async function decryptWorkflowSteps(
  encryptedData: Uint8Array,
  key: CryptoKey,
): Promise<WorkflowStep[]> {
  const iv = encryptedData.slice(0, 12);
  const ciphertext = encryptedData.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );

  const json = new TextDecoder().decode(decrypted);
  return JSON.parse(json) as WorkflowStep[];
}
```

### Seal Service API Calls

```typescript
// Register key + create access policy
async function createSealAccessPolicy(params: {
  creatorAddress: string;
  priceMist: bigint;
  keyBytes: Uint8Array;
}): Promise<{ policyId: string; keyId: string }> {
  // POST to Seal service
  const response = await fetch('https://seal-testnet.mystenlabs.com/v1/policies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creator: params.creatorAddress,
      price: params.priceMist.toString(),
      key: Array.from(params.keyBytes),
      network: 'testnet',
    }),
  });

  const result = await response.json();
  return { policyId: result.policyId, keyId: result.keyId };
}

// Request decryption key after payment
async function requestSealKey(params: {
  policyId: string;
  payerAddress: string;
  txDigest: string;
}): Promise<CryptoKey> {
  const response = await fetch(
    `https://seal-testnet.mystenlabs.com/v1/policies/${params.policyId}/request-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payer: params.payerAddress,
        txDigest: params.txDigest,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Seal key request failed: ${response.status}`);
  }

  const result = await response.json();
  const keyBytes = new Uint8Array(result.key);

  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
}
```

> **Note:** The exact Seal service endpoints and SDK API may differ from the above. This is the architectural target. When implementing, verify the actual `@mysten/seal` package API and adjust accordingly.

## 8. Backend API Changes

### Firestore Collections

```
workflows/{workflowId}
  ├─ ...existing fields...
  ├─ isPremium: true
  ├─ unlockPriceMist: "500000000"
  ├─ sealEncryptedBlobId: "..."
  └─ sealAccessPolicyId: "..."

workflow_unlocks/{userId}_{workflowId}
  ├─ userId: "..."
  ├─ workflowId: "..."
  ├─ creatorUid: "..."
  ├─ amountMist: "500000000"
  ├─ txDigest: "..."
  └─ paidAt: Timestamp
```

### Backend Functions (`src/lib/backend.ts`)

```typescript
export const workflowUnlocksApi = {
  async isUnlocked(userId: string, workflowId: string): Promise<boolean> {
    const docRef = doc(db, 'workflow_unlocks', `${userId}_${workflowId}`);
    const snap = await getDoc(docRef);
    return snap.exists();
  },

  async recordUnlock(record: Omit<WorkflowUnlockRecord, 'id'>): Promise<void> {
    const docRef = doc(db, 'workflow_unlocks', `${record.userId}_${record.workflowId}`);
    await setDoc(docRef, {
      ...record,
      paidAt: serverTimestamp(),
    });
  },

  async getUnlockedWorkflowIds(userId: string): Promise<string[]> {
    const colRef = collection(db, 'workflow_unlocks');
    const q = query(colRef, where('userId', '==', userId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data().workflowId as string);
  },
};
```

## 9. Security Considerations

1. **Never store the AES key in Firestore or browser localStorage.** The key lives only in the Seal service. The browser requests it on-demand after payment verification.

2. **Encrypt before uploading to Walrus.** The Walrus blob contains ciphertext only. Without the key (controlled by Seal), the blob is meaningless.

3. **Verify payment on-chain before recording unlock.** The unlock record should only be written after the Sui transaction is confirmed successful.

4. **Rate-limit Seal key requests** (on Seal service side, but also client-side debounce).

5. **Creator can't decrypt their own content without paying.** The creator's key is held by Seal service; they must also go through the unlock flow (or we add a creator bypass in the policy). Recommendation: add a `creatorUid` bypass so creators can always preview their own premium workflows without paying.

## 10. Implementation Phases

### Phase 1: Data Model & Types (1-2 hours)
- Extend `Workflow`, `WorkflowCreateInput` types
- Add `WorkflowUnlockRecord` type
- Add `VITE_ENABLE_PREMIUM_WORKFLOWS` env var
- Update `workflowsApi.createWorkflow()` to accept premium fields

### Phase 2: Seal Encryption Module (3-4 hours)
- Install `@mysten/seal`
- Create `src/lib/seal.ts` with `encryptWorkflowSteps()` and `decryptWorkflowSteps()`
- Create `src/lib/seal-payments.ts` with `sendUnlockPayment()`
- Integrate Walrus upload for encrypted blob
- Test encryption/decryption roundtrip

### Phase 3: Creation Flow (2-3 hours)
- Add premium toggle + price input to `Post.tsx` workflow creation form
- Wire encryption: encrypt steps → upload to Walrus → store blob ID on workflow doc
- Store `steps: []` (empty) on the public Firestore doc so nothing leaks

### Phase 4: Viewing / Unlock Flow (4-5 hours)
- Create `PremiumWorkflowDetail.tsx` with locked/unlocked states
- Add unlock gate overlay with price and payment button
- Wire payment: build tx → sign → execute → get txDigest
- Call Seal service to request decryption key
- Decrypt steps locally and render
- Record unlock in Firestore
- Cache decrypted steps in component state (not persisted)

### Phase 5: Card & Feed Updates (2-3 hours)
- Update `WorkflowCard.tsx` to show lock badge + price for premium workflows
- Update `Feed.tsx` to handle premium workflows in grid
- Update `UserProfile.tsx` to show premium workflows tab

### Phase 6: Paid Likes on Premium (1 hour)
- Wire existing `workflowsApi.toggleLike()` with SUI payment for premium workflows
- Reuse existing royalty split logic (no new contract needed)

### Phase 7: Polish & Testing (2-3 hours)
- TypeScript check
- Test create → lock → unlock → view full flow
- Verify blob IDs are encrypted (not visible in Firestore doc)
- Error states: insufficient balance, Seal service down, tx reverted

## 11. Open Questions (to resolve before Phase 2)

1. **Exact Seal SDK API** — need to verify `@mysten/seal` package exports and service endpoints once installed
2. **Self-hosted vs Mysten-hosted Seal service** — Mysten runs a testnet Seal service; for production, we may need to self-host
3. **Walrus upload for encrypted blobs** — confirm Walrus SDK supports arbitrary binary payloads (not just media)
4. **Creator bypass** — should creators see their own premium workflows unlocked by default? (Recommended: yes)

## 12. Rollout / Disable Strategy

Since this is fully behind `VITE_ENABLE_PREMIUM_WORKFLOWS`:

```
# To disable entirely:
VITE_ENABLE_PREMIUM_WORKFLOWS=false

# Effect:
- Premium workflows still exist in Firestore but appear as normal workflows
- Unlock UI is hidden
- Steps are shown as "content unavailable" (graceful degradation)
- No encryption/decryption code paths execute
```

If the feature is disabled, existing premium workflow docs in Firestore will have empty `steps[]` arrays (since the real data is in the encrypted blob). We should add a fallback: if `isPremium` is true but the feature is disabled, show a "Premium content unavailable" message instead of an empty workflow.

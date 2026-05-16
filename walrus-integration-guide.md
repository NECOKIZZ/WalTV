# Walrus Integration Guide
### Migrating Media Storage from Supabase → Walrus

> **Walrus** is decentralized blob storage built on the Sui blockchain by Mysten Labs.
> Mainnet launched March 27, 2025. All blobs are **public by default** — use Seal for private/gated media.

---

## Table of Contents

1. [Should You Start on Testnet or Mainnet?](#1-should-you-start-on-testnet-or-mainnet)
2. [How Easy Is the Testnet → Mainnet Switch?](#2-how-easy-is-the-testnet--mainnet-switch)
3. [Core Concepts](#3-core-concepts)
4. [Integration Paths — Which One For Your App?](#4-integration-paths--which-one-for-your-app)
5. [Official TypeScript SDK — `@mysten/walrus`](#5-official-typescript-sdk--mystenwallrus)
6. [HTTP API (Publisher/Aggregator)](#6-http-api-publisheraggregator)
7. [Community SDKs](#7-community-sdks)
8. [Media Upload Patterns for a dApp](#8-media-upload-patterns-for-a-dapp)
9. [Supabase → Walrus Migration Map](#9-supabase--walrus-migration-map)
10. [Private Media with Seal](#10-private-media-with-seal)
11. [Walrus Sites — Hosting Your Frontend](#11-walrus-sites--hosting-your-frontend)
12. [Tooling, Explorers & Monitoring](#12-tooling-explorers--monitoring)
13. [Costs & Token Setup](#13-costs--token-setup)
14. [Important Gotchas](#14-important-gotchas)
15. [Key Links](#15-key-links)

---

## 1. Should You Start on Testnet or Mainnet?

**Recommendation: Start on Testnet to learn the API — but build your production app targeting Mainnet from day one.**

Here's why this matters specifically for your situation (migrating media storage):

### Testnet
- Free tokens (`walrus get-wal` exchanges Testnet SUI for Testnet WAL, 1:1, both worthless)
- Epochs are **1 day** long (short, good for iteration)
- **Data is NOT persistent** — can be wiped at any time without warning
- New features land here first, which can break deployed testnet apps
- No public portal for Walrus Sites on Testnet anymore
- Great for: learning the API, testing upload/download flows, checking file format compatibility

### Mainnet
- Requires real WAL + SUI tokens
- Epochs are **2 weeks** long (data stored per epoch, more stable and meaningful)
- 100+ decentralized storage nodes, security guarantees hold
- Your blob IDs are stable and permanent (until expiry)
- Great for: any real user data, production media storage

### The Practical Approach

Use Testnet for your first 1–2 weeks to nail the integration. The moment your upload/download flows work, flip to Mainnet. There's no point running a media app on Testnet because user-uploaded content will disappear. **Don't build product features around Testnet blobs.**

---

## 2. How Easy Is the Testnet → Mainnet Switch?

**Very easy — it's a one-line config change.** This is one of Walrus's best DX features.

### SDK switch

```typescript
// Testnet
const walrusClient = new WalrusClient({
  network: 'testnet',
  suiClient,
});

// Mainnet — change ONE word
const walrusClient = new WalrusClient({
  network: 'mainnet',
  suiClient,
});
```

### HTTP API switch

```bash
# Testnet
AGGREGATOR=https://aggregator.walrus-testnet.walrus.space
PUBLISHER=https://publisher.walrus-testnet.walrus.space

# Mainnet — swap the URLs (or your self-hosted publisher)
AGGREGATOR=https://aggregator.walrus.space
PUBLISHER=https://publisher.walrus.space
# or community mainnet publishers like:
# https://walrus-mainnet-publisher-1.staketab.org:443
```

### What actually changes

| Thing | Testnet | Mainnet |
|---|---|---|
| `network` config | `'testnet'` | `'mainnet'` |
| Aggregator URL | `aggregator.walrus-testnet.walrus.space` | `aggregator.walrus.space` |
| Publisher URL | `publisher.walrus-testnet.walrus.space` | community / self-hosted |
| Token cost | Free (test WAL) | Real WAL |
| Epoch length | 1 day | 2 weeks |
| Data persistence | None guaranteed | Yes (for duration of epochs paid) |
| Blob IDs | Different (Testnet blobs don't exist on Mainnet) | Stable |

> **Note:** Blob IDs from Testnet are NOT the same as Mainnet. When you switch, all media your users uploaded on Testnet must be re-uploaded. Plan for this — don't store Testnet blob IDs in your production database.

### Preparation tip

Structure your environment config like this from the start:

```typescript
// config/walrus.ts
const WALRUS_CONFIG = {
  testnet: {
    network: 'testnet' as const,
    suiRpc: 'https://fullnode.testnet.sui.io:443',
    aggregator: 'https://aggregator.walrus-testnet.walrus.space',
    publisher: 'https://publisher.walrus-testnet.walrus.space',
  },
  mainnet: {
    network: 'mainnet' as const,
    suiRpc: 'https://fullnode.mainnet.sui.io:443',
    aggregator: 'https://aggregator.walrus.space',
    publisher: 'https://walrus-mainnet-publisher-1.staketab.org:443',
  },
};

const ENV = process.env.WALRUS_NETWORK as 'testnet' | 'mainnet' || 'testnet';
export const config = WALRUS_CONFIG[ENV];
```

Then `WALRUS_NETWORK=mainnet` in your prod `.env` and you're done.

---

## 3. Core Concepts

Understanding these will save you many hours.

### Blobs
Every file you store in Walrus is a **blob** — an arbitrary byte array. Images, videos, audio, JSON, anything. Each blob gets a **Blob ID** (a base64 string) which is your permanent reference, analogous to a Supabase storage path or S3 key.

```
d6FijSlrtRd9C_hkZYnXgqqiqAxP_pxx9gi9Qskw-Xs   ← example Blob ID
```

### Epochs
Storage is purchased in **epochs** (1 day on Testnet, 2 weeks on Mainnet). When you store a blob, you pay for N epochs upfront. You can extend epochs later. After all epochs expire, the blob may be garbage collected. For media apps, use `--epochs max` or a large number.

### Erasure Coding (RedStuff)
Files are NOT simply replicated across nodes. They're encoded into slivers and distributed such that any 1/3 of nodes can reconstruct the full file. This is why it's 4–5x storage cost rather than 100x. Cost: roughly 5× the file size in storage terms.

### Publishers & Aggregators
- **Publisher**: accepts your file upload (HTTP PUT), handles the complex on-chain registration and node distribution on your behalf
- **Aggregator**: serves file reads (HTTP GET), reconstructs blobs from slivers
- These are the **simplest integration path** — no SDK needed, just REST calls

### Blob IDs as Sui Objects
Each stored blob is represented as a **Sui object** on-chain. This means:
- You can own blobs (they live in your wallet)
- Smart contracts can reference, transfer, or delete blobs
- You can store the Blob ID in your database and reconstruct the URL anytime

---

## 4. Integration Paths — Which One For Your App?

For a media app migrating from Supabase, here's the decision tree:

```
Are users uploading media directly in the browser?
├── YES → Use Publisher HTTP API (server-side) OR @mysten/walrus SDK (client-side)
│         If users pay their own WAL → SDK
│         If your app pays storage → Publisher HTTP API (recommended)
└── NO (server/backend upload) → Publisher HTTP API
                                  (simplest, no blockchain knowledge needed)

Do you need private/access-controlled media?
├── YES → Walrus + Seal SDK
└── NO (public media) → HTTP API or @mysten/walrus SDK
```

**For most media dApps replacing Supabase:** Use the **Publisher HTTP API** for backend uploads and the **Aggregator HTTP API** for serving media. This is the closest equivalent to Supabase Storage's REST API.

---

## 5. Official TypeScript SDK — `@mysten/walrus`

The official SDK from Mysten Labs. Use when users need to pay their own storage fees, or when you need fine-grained control over the upload lifecycle.

### Installation

```bash
npm install @mysten/walrus @mysten/sui
# or
pnpm add @mysten/walrus @mysten/sui
# or
yarn add @mysten/walrus @mysten/sui
```

If building for the browser, also install the WASM bindings:

```bash
npm install @mysten/walrus-wasm
```

### Basic Setup (Node.js / Backend)

```typescript
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { WalrusClient } from '@mysten/walrus';

const suiClient = new SuiClient({
  url: getFullnodeUrl('mainnet'), // or 'testnet'
});

const walrusClient = new WalrusClient({
  network: 'mainnet', // or 'testnet'
  suiClient,
});
```

### Browser / Next.js Setup

For browser use, you need to point to the WASM file:

```typescript
// Option A: Using Vite (add to vite.config.ts)
// optimizeDeps: { exclude: ['@mysten/walrus-wasm'] }

import walrusWasmUrl from '@mysten/walrus-wasm/web/walrus_wasm_bg.wasm?url';

const walrusClient = new WalrusClient({
  network: 'mainnet',
  suiClient,
  wasmUrl: walrusWasmUrl,
});

// Option B: Load from CDN (no bundler config needed)
const walrusClient = new WalrusClient({
  network: 'mainnet',
  suiClient,
  wasmUrl: 'https://unpkg.com/@mysten/walrus-wasm@latest/web/walrus_wasm_bg.wasm',
});
```

**Next.js API routes** — add this to `next.config.ts`:

```typescript
const nextConfig = {
  serverExternalPackages: ['@mysten/walrus', '@mysten/walrus-wasm'],
};
export default nextConfig;
```

### Alternative: SuiGrpcClient (newer pattern)

```typescript
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { walrus } from '@mysten/walrus';

const client = new SuiGrpcClient({
  network: 'mainnet',
  baseUrl: 'https://fullnode.mainnet.sui.io:443',
}).$extend(walrus());
```

### Uploading a Blob (with signer key — backend/server)

```typescript
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { WalrusClient, WalrusFile } from '@mysten/walrus';
import { readFileSync } from 'fs';

const keypair = Ed25519Keypair.fromSecretKey(process.env.WALLET_PRIVATE_KEY!);

// Method 1: Simple writeBlob
async function uploadMedia(fileBuffer: Buffer, contentType: string) {
  const blobId = await walrusClient.writeBlob({
    blob: fileBuffer,
    deletable: false,      // true = can delete later (cheaper if you might remove it)
    epochs: 52,            // ~2 years on mainnet (52 × 2 weeks)
    signer: keypair,
  });
  return blobId;
}

// Method 2: WalrusFile API (recommended — handles quilts and future storage patterns)
async function uploadWithFile(fileBuffer: Buffer, filename: string) {
  const file = WalrusFile.from(new Uint8Array(fileBuffer), {
    identifier: filename,
    tags: {
      'content-type': 'image/jpeg', // set correct MIME type
    },
  });

  const results = await walrusClient.writeFiles({
    files: [file],
    deletable: false,
    epochs: 52,
    signer: keypair,
  });

  return results[0].blobId;
}
```

### Uploading via Upload Relay (Browser — recommended for frontend)

The 4-step flow using `writeFilesFlow` — avoids the browser making ~2200 requests directly to storage nodes:

```typescript
import { WalrusFile } from '@mysten/walrus';

async function uploadFromBrowser(file: File, signAndExecute: Function) {
  // Step 1: Create WalrusFile and encode
  const files = [
    WalrusFile.from({
      contents: new Uint8Array(await file.arrayBuffer()),
      identifier: file.name,
    }),
  ];

  const flow = walrusClient.writeFilesFlow({ files });
  await flow.encode(); // Computes erasure coding metadata

  // Step 2: Register blob on-chain (triggers wallet popup)
  const { digest } = await flow.register({
    epochs: 52,
    deletable: false,
    signer: userWallet, // from @mysten/dapp-kit-react
  });

  // Step 3: Upload to relay (one request instead of thousands)
  await flow.upload({ digest });

  // Step 4: Certify on Sui (triggers second wallet popup)
  await flow.certify({ digest, signer: userWallet });

  return flow.files[0].blobId;
}
```

### Reading a Blob

```typescript
// Read raw bytes
const bytes = await walrusClient.readBlob({ blobId: 'YOUR_BLOB_ID' });

// Decode as text
const text = new TextDecoder().decode(bytes);

// Decode as image (browser)
const blob = new Blob([bytes], { type: 'image/jpeg' });
const url = URL.createObjectURL(blob);
```

### Error Handling — Epoch Changes

```typescript
import { RetryableWalrusClientError } from '@mysten/walrus';

async function robustRead(blobId: string) {
  try {
    return await walrusClient.readBlob({ blobId });
  } catch (error) {
    if (error instanceof RetryableWalrusClientError) {
      // Reset client cache and retry once
      walrusClient.reset();
      return await walrusClient.readBlob({ blobId });
    }
    throw error;
  }
}
```

### Custom Timeouts (important — some nodes are slow)

```typescript
const walrusClient = new WalrusClient({
  network: 'mainnet',
  suiClient,
  storageNodeClientOptions: {
    timeout: 60_000, // 60s (default is 10s, which causes timeouts on slow nodes)
    onError: (err) => console.warn('Storage node error:', err),
  },
});
```

---

## 6. HTTP API (Publisher/Aggregator)

The simplest integration. Works with `curl`, `fetch`, or any HTTP client. No SDK, no blockchain knowledge needed — closest to calling a Supabase REST API.

### Public Endpoints

```bash
# Testnet
AGGREGATOR=https://aggregator.walrus-testnet.walrus.space
PUBLISHER=https://publisher.walrus-testnet.walrus.space

# Mainnet (community-run, use for dev — self-host for production)
AGGREGATOR=https://aggregator.walrus.space
PUBLISHER=https://walrus-mainnet-publisher-1.staketab.org:443
# Nami Cloud publisher: check https://github.com/MystenLabs/awesome-walrus for current URL
```

> ⚠️ Public mainnet publishers are rate-limited and may have uptime variability. For a production media app, self-host your own publisher or use Nami Cloud's managed service.

### Store a Blob (Upload)

```bash
# Upload a string
curl -X PUT "$PUBLISHER/v1/blobs?epochs=52" -d "some string"

# Upload a file
curl -X PUT "$PUBLISHER/v1/blobs?epochs=52" --upload-file ./image.jpg

# Upload + send Sui blob object to your wallet (so you own it)
curl -X PUT "$PUBLISHER/v1/blobs?epochs=52&send_object_to=0xYOUR_SUI_ADDRESS" \
  --upload-file ./video.mp4

# Upload as deletable (can remove later to reclaim storage fees)
curl -X PUT "$PUBLISHER/v1/blobs?epochs=52&deletable=true" \
  --upload-file ./photo.jpg
```

**Response:**

```json
// Newly uploaded
{
  "newlyCreated": {
    "blobObject": {
      "blobId": "d6FijSlrtRd9C_hkZYnXgqqiqAxP_pxx9gi9Qskw-Xs",
      "id": "0xe63a770088ef7d3f5a1520cc977498fa046fb49d6863426fd84c67890944b522",
      "storedEpoch": 5,
      "certifiedEpoch": 5,
      "expirationEpoch": 57,
      "encodedSize": 665600,
      "deletable": false
    }
  }
}

// Already existed (content-addressed, same blob ID returned)
{
  "alreadyCertified": {
    "blobId": "d6FijSlrtRd9C_hkZYnXgqqiqAxP_pxx9gi9Qskw-Xs",
    "event": { ... },
    "endEpoch": 57
  }
}
```

### Read a Blob (Download / Serve)

```bash
# Fetch raw blob by ID
curl "$AGGREGATOR/v1/blobs/d6FijSlrtRd9C_hkZYnXgqqiqAxP_pxx9gi9Qskw-Xs" \
  --output downloaded.jpg

# Use as image src directly
<img src="https://aggregator.walrus.space/v1/blobs/BLOB_ID" />
```

### JavaScript / TypeScript Fetch

```typescript
const PUBLISHER = process.env.WALRUS_PUBLISHER_URL!;
const AGGREGATOR = process.env.WALRUS_AGGREGATOR_URL!;

// Upload media
export async function uploadMedia(
  file: File | Buffer | Uint8Array,
  options: { epochs?: number; deletable?: boolean; sendTo?: string } = {}
): Promise<string> {
  const { epochs = 52, deletable = false, sendTo } = options;

  const params = new URLSearchParams({
    epochs: epochs.toString(),
    ...(deletable && { deletable: 'true' }),
    ...(sendTo && { send_object_to: sendTo }),
  });

  const response = await fetch(`${PUBLISHER}/v1/blobs?${params}`, {
    method: 'PUT',
    body: file,
    headers: file instanceof File
      ? { 'Content-Type': file.type }
      : { 'Content-Type': 'application/octet-stream' },
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status} ${await response.text()}`);
  }

  const json = await response.json();
  return (
    json.newlyCreated?.blobObject?.blobId ??
    json.alreadyCertified?.blobId
  );
}

// Get media URL (for use in <img>, <video>, etc.)
export function getMediaUrl(blobId: string): string {
  return `${AGGREGATOR}/v1/blobs/${blobId}`;
}

// Download blob as buffer
export async function downloadMedia(blobId: string): Promise<ArrayBuffer> {
  const response = await fetch(`${AGGREGATOR}/v1/blobs/${blobId}`);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  return response.arrayBuffer();
}
```

### API Spec

Each aggregator/publisher exposes its full OpenAPI spec at `/v1/api`:

```
https://aggregator.walrus-testnet.walrus.space/v1/api
```

---

## 7. Community SDKs

### `walrus-ts` — simpler TypeScript wrapper

```bash
npm install walrus-ts
```

```typescript
import { createWalrusClient } from 'walrus-ts';

const client = createWalrusClient();
// or with custom endpoints:
const client = createWalrusClient({
  aggregatorUrl: 'https://aggregator.walrus.space',
  publisherUrl: 'https://publisher.walrus.space',
});

// Store JSON
const result = await client.storeJSON({ name: 'photo', url: '...' }, { epochs: 10 });
console.log(result.blob.blobId);

// Retrieve JSON
const data = await client.readJSON<{ name: string }>(result.blob.blobId);

// Store bytes
const blobId = await client.store(imageBuffer, { epochs: 52 });

// Encrypted storage
const key = crypto.getRandomValues(new Uint8Array(32));
const encBlobId = await client.storeEncrypted(data, key, { epochs: 52 });
const decrypted = await client.readEncrypted(encBlobId, key);
```

GitHub: https://github.com/soya-miruku/walrus-sdk

---

### `@galliun/walrus-sdk` — minimal store/read

```bash
npm install @galliun/walrus-sdk
```

```typescript
import WalrusSDK from '@galliun/walrus-sdk';

const walrus = new WalrusSDK({
  aggregatorUrl: 'https://aggregator.walrus.space',
  publisherUrl: 'https://walrus-mainnet-publisher-1.staketab.org:443',
});

// Store
const response = await walrus.store('Hello Walrus!', { epochs: 5 });
if ('newlyCreated' in response) {
  console.log('Blob ID:', response.newlyCreated.blobObject.blobId);
}

// Read as string
const text = await walrus.read(blobId);

// Read as buffer
const buffer = await walrus.readAsBuffer(blobId);

// Read as stream
const stream = await walrus.readAsStream(blobId);
```

npm: https://www.npmjs.com/package/@galliun/walrus-sdk

---

### Go SDK

```go
go get github.com/suiet/walrus-go

import "github.com/suiet/walrus-go"

// Default testnet endpoints
client := walrus.NewClient()

// Custom endpoints
client := walrus.NewClient(
  walrus.WithAggregatorURLs([]string{"https://aggregator.walrus.space"}),
  walrus.WithPublisherURLs([]string{"https://walrus-mainnet-publisher-1.staketab.org:443"}),
)

// Store
resp, err := client.Store(data, &walrus.StoreOptions{ Epochs: 52 })
blobId := resp.NewlyCreated.BlobObject.BlobId

// Store file
resp, err = client.StoreFile("./image.jpg", &walrus.StoreOptions{ Epochs: 52 })

// Read
data, err := client.Read(blobId, nil)

// With AES-256 encryption
key := make([]byte, 32)
rand.Read(key)
resp, _ = client.Store(data, &walrus.StoreOptions{
  Epochs: 52,
  Encryption: &walrus.EncryptionOptions{ Key: key },
})
```

---

### PHP SDK

```bash
composer require suicore/walrus-sdk-php
```

```php
use Suicore\Walrus\WalrusClient;
use Suicore\Walrus\Types\StoreBlobOrQuiltOptions;

$client = new WalrusClient(
  'https://walrus-mainnet-publisher-1.staketab.org:443',
  'https://aggregator.walrus.space'
);

$options = new StoreBlobOrQuiltOptions(epochs: 52);

// Store
$response = $client->storeBlob("Hello!", $options);
$blobId = $response->getNewlyCreated()->getBlobObject()->getBlobId();

// Store a file
$response = $client->storeBlob('/path/to/image.jpg', $options, isFile: true);

// Read
$content = $client->getBlob($blobId);
```

---

### Tusky SDK — Full Filesystem on Walrus

If you want folder structure, file management, and access control (similar to Supabase Storage buckets):

```bash
npm install @tusky-io/ts-sdk
```

```typescript
import { Tusky } from "@tusky-io/ts-sdk";

const tusky = await Tusky.init({ wallet: yourWallet });

// Create vault (like a bucket)
const vaultId = await tusky.vault.create("My Media Vault", { public: true });

// Upload file
const uploadId = await tusky.file.upload(vaultId, file);

// List files
const files = await tusky.file.list(vaultId);

// Get file URL
const url = await tusky.file.getDownloadUrl(fileId);
```

Docs: https://docs.tusky.io

---

## 8. Media Upload Patterns for a dApp

### Pattern 1: Backend Upload (Server Pays Storage) — Recommended for Most Apps

Your backend proxies the upload, pays the WAL fees, stores the Blob ID in your database.

```typescript
// pages/api/upload.ts (Next.js example)
import { uploadMedia, getMediaUrl } from '@/lib/walrus';
import { db } from '@/lib/db';
import formidable from 'formidable';
import fs from 'fs';

export default async function handler(req, res) {
  const form = formidable();
  const [fields, files] = await form.parse(req);
  const file = files.file[0];

  const fileBuffer = fs.readFileSync(file.filepath);

  const blobId = await uploadMedia(fileBuffer, {
    epochs: 52,
    sendTo: process.env.APP_WALLET_ADDRESS, // retain ownership
  });

  // Store blobId in your DB instead of a Supabase path
  const media = await db.media.create({
    data: {
      blobId,
      filename: file.originalFilename,
      mimeType: file.mimetype,
      url: getMediaUrl(blobId),
      userId: req.session.userId,
    },
  });

  res.json({ blobId, url: getMediaUrl(blobId) });
}
```

### Pattern 2: Frontend Direct Upload (User Pays Storage)

```tsx
// components/MediaUpload.tsx
import { useWalrusUpload } from '@/hooks/useWalrusUpload';

export function MediaUpload() {
  const { upload, blobId, uploading, error } = useWalrusUpload();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await upload(file);
  }

  return (
    <div>
      <input type="file" accept="image/*,video/*" onChange={handleFile} />
      {uploading && <p>Uploading to Walrus...</p>}
      {blobId && <img src={`${AGGREGATOR}/v1/blobs/${blobId}`} />}
    </div>
  );
}
```

```typescript
// hooks/useWalrusUpload.ts
import { useState } from 'react';
import { useCurrentWallet, useSignAndExecuteTransaction } from '@mysten/dapp-kit-react';
import { WalrusFile } from '@mysten/walrus';
import { walrusClient } from '@/lib/walrus';

export function useWalrusUpload() {
  const [blobId, setBlobId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  async function upload(file: File) {
    setUploading(true);
    try {
      const files = [WalrusFile.from({
        contents: new Uint8Array(await file.arrayBuffer()),
        identifier: file.name,
      })];

      const flow = walrusClient.writeFilesFlow({ files });
      await flow.encode();

      const { digest } = await flow.register({
        epochs: 52,
        signer: { signAndExecuteTransaction: signAndExecute },
      });

      await flow.upload({ digest });
      await flow.certify({ digest, signer: { signAndExecuteTransaction: signAndExecute } });

      setBlobId(flow.files[0].blobId);
    } finally {
      setUploading(false);
    }
  }

  return { upload, blobId, uploading };
}
```

### Pattern 3: Serving Media in Your UI

```tsx
// The aggregator URL IS the media URL — no CDN setup needed
function MediaCard({ blobId, mimeType }: { blobId: string; mimeType: string }) {
  const url = `${process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR}/v1/blobs/${blobId}`;

  if (mimeType.startsWith('image/')) {
    return <img src={url} alt="media" loading="lazy" />;
  }

  if (mimeType.startsWith('video/')) {
    return <video src={url} controls preload="metadata" />;
  }

  return <a href={url} download>Download file</a>;
}
```

---

## 9. Supabase → Walrus Migration Map

| Supabase Storage | Walrus Equivalent |
|---|---|
| `supabase.storage.from('bucket').upload(path, file)` | `PUT $PUBLISHER/v1/blobs?epochs=52` or `walrusClient.writeBlob()` |
| `supabase.storage.from('bucket').getPublicUrl(path)` | `$AGGREGATOR/v1/blobs/{blobId}` |
| `supabase.storage.from('bucket').download(path)` | `GET $AGGREGATOR/v1/blobs/{blobId}` |
| `supabase.storage.from('bucket').remove([path])` | `walrus delete` (only if blob was marked `deletable: true` at upload time) |
| Storage path string in DB | Blob ID string in DB |
| Bucket ACL / RLS policies | Seal SDK (on-chain access control) |
| Signed URLs for private files | Seal encryption + decryption key distribution |
| Storage dashboard | Walrus Blob Explorer / SuiScan |

### Database Migration Tip

If you're storing Supabase paths in your DB today, create a `blob_id` column alongside your existing `storage_path`. Run your migration to backfill blob IDs for existing files, then switch your app to write blob IDs for new uploads. Once stable, drop the old column.

```sql
-- Add alongside existing column
ALTER TABLE media ADD COLUMN walrus_blob_id TEXT;

-- After migration is complete and verified
-- ALTER TABLE media DROP COLUMN supabase_path;
```

---

## 10. Private Media with Seal

All Walrus blobs are public. If your media app needs gated content (paid subscriptions, NFT access, private profiles), use **Seal**.

### Install

```bash
npm install @mysten/seal
```

### Encrypt before upload, decrypt on access

```typescript
import { SealClient, SessionKey } from '@mysten/seal';
import { Transaction } from '@mysten/sui/transactions';

const sealClient = new SealClient({
  suiClient,
  serverObjectIds: [process.env.SEAL_KEY_SERVER_ID!],
});

// --- UPLOAD FLOW ---
async function uploadPrivateMedia(fileBuffer: Buffer, suiObjectGatingAccess: string) {
  // 1. Encrypt with Seal (client-side)
  const { encryptedBytes } = await sealClient.encrypt({
    data: new Uint8Array(fileBuffer),
    packageId: process.env.MOVE_PACKAGE_ID!,
    id: suiObjectGatingAccess, // the Sui object that gates access (e.g. NFT ID)
  });

  // 2. Upload encrypted bytes to Walrus
  const blobId = await uploadMedia(Buffer.from(encryptedBytes), { epochs: 52 });

  return blobId; // store this in your DB
}

// --- ACCESS FLOW (when user requests media) ---
async function getPrivateMedia(blobId: string, userWallet: any) {
  // 1. Fetch encrypted bytes from Walrus
  const encryptedBytes = new Uint8Array(await downloadMedia(blobId));

  // 2. User signs a SessionKey proving identity
  const sessionKey = new SessionKey({
    suiClient,
    packageId: process.env.MOVE_PACKAGE_ID!,
    ttlMin: 10,
  });
  const sig = await userWallet.signPersonalMessage(sessionKey.getPersonalMessage());
  sessionKey.setPersonalMessageSignature(sig);

  // 3. Build the approval transaction (Seal checks on-chain)
  const tx = new Transaction();
  tx.moveCall({
    target: `${process.env.MOVE_PACKAGE_ID}::media::seal_approve`,
    arguments: [tx.pure.vector('u8', Array.from(encryptedBytes.slice(0, 32)))],
  });
  const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });

  // 4. Decrypt
  const decryptedBytes = await sealClient.decrypt({
    data: encryptedBytes,
    sessionKey,
    txBytes,
  });

  return decryptedBytes;
}
```

**Seal docs:** https://seal-docs.wal.app

---

## 11. Walrus Sites — Hosting Your Frontend

If your dApp frontend is a static site (React, Next.js static export, Svelte), you can host it fully on-chain.

### Install site-builder

```bash
# Using suiup (recommended)
suiup install site-builder

# Or via cargo
cargo install --locked walrus-site-builder
```

### Publish

```bash
# Build your app first
npm run build

# Publish to Walrus
walrus site publish ./dist --epochs max

# Update existing site
walrus site update ./dist --site-object-id 0xYOUR_SITE_OBJECT_ID
```

Your site is accessible at: `https://YOUR_SITE_OBJECT_ID.wal.app`

For CI/CD, use the `walrus-sites-deploy` GitHub Action.

---

## 12. Tooling, Explorers & Monitoring

| Tool | Purpose | Link |
|---|---|---|
| **Walrus CLI** | Store/read/delete blobs from terminal | `suiup install walrus` |
| **Walrus Blob Explorer** | Browse blobs, analytics | https://walruscan.com |
| **SuiScan Walrus** | Blob objects on Sui | https://suiscan.xyz |
| **Blockberry API** | Analytics, accounts, blob metadata | https://api.blockberry.one/walrus |
| **Walrus Cost Calculator** | Estimate WAL cost for your storage | https://blobboard.xyz |
| **Nami Cloud** | Managed mainnet publisher (no self-hosting) | https://namicloud.io |
| **Morsa** | Storage node monitoring (Slack/Discord alerts) | awesome-walrus |
| **ChainViz** | 3D globe network explorer | awesome-walrus |

### `wal-dev` — Quick-start npm toolkit

```bash
npm install -g wal-dev
wal-dev init my-walrus-app
```

---

## 13. Costs & Token Setup

### Getting WAL (Mainnet)

- Buy WAL on **Gate.io**, **KuCoin**, or **Binance** (futures)
- Swap using **Slush Wallet** (Sui's native wallet — supports SUI ↔ WAL)
- Note: the `walrus get-wal` faucet command only works on Testnet

### Getting Testnet WAL

```bash
# Install Walrus CLI first via suiup
walrus get-wal --context testnet
# Exchanges 0.5 testnet SUI → 0.5 testnet WAL (no real value)
```

### Cost Estimation

Walrus charges ~5× the file size in storage across its epoch period. For rough estimates:

- A 1 MB image stored for 1 year (26 epochs × 2 weeks): ~5 MB storage units
- Actual WAL cost depends on current network prices — use the **Walrus Cost Calculator** (https://blobboard.xyz) for live estimates

For your backend/server-side publisher, ensure your wallet has:
- Sufficient **SUI** for gas (each blob registration is a Sui transaction)
- Sufficient **WAL** for storage fees
- The publisher auto-manages sub-wallets (default: 8 concurrent sub-wallets)

---

## 14. Important Gotchas

1. **Public by default** — every blob is publicly accessible. Never store unencrypted private media without Seal.

2. **Epochs expire** — blobs are deleted when their epoch count runs out. Use large epoch counts (`--epochs max` or `52+`) for production media. You can extend epochs later.

3. **Testnet wipes** — never store Testnet blob IDs in your production database. Testnet can be wiped without warning.

4. **Public publisher rate limits** — community publishers cap uploads at 10 MiB by default. For larger files or production throughput, self-host or use Nami Cloud.

5. **Browser direct node requests** — writing a blob direct to nodes requires ~2200 requests. Always use an upload relay or publisher in browser environments.

6. **Deletable flag is permanent** — a blob marked `deletable: false` at creation cannot be made deletable later. Decide upfront. Deletable blobs are cheaper to maintain.

7. **Content-addressed storage** — if two users upload the exact same file, they get the same Blob ID. This is a feature (deduplication) but means you can't "overwrite" a file. Each new version gets a new Blob ID.

8. **Next.js bundler** — must add `@mysten/walrus` and `@mysten/walrus-wasm` to `serverExternalPackages` in `next.config.ts`.

9. **Vite** — must exclude `@mysten/walrus-wasm` from `optimizeDeps`.

10. **send_object_to on shared publishers** — always pass `send_object_to=YOUR_ADDRESS` when using shared publishers so the blob Sui object is owned by you, not the publisher's sub-wallet.

---

## 15. Key Links

| Resource | URL |
|---|---|
| Official Docs | https://docs.wal.app |
| SDK Docs (Mysten) | https://sdk.mystenlabs.com/walrus |
| npm — `@mysten/walrus` | https://www.npmjs.com/package/@mysten/walrus |
| npm — `walrus-ts` | https://www.npmjs.com/package/walrus-ts |
| npm — `@galliun/walrus-sdk` | https://www.npmjs.com/package/@galliun/walrus-sdk |
| Tusky (filesystem) | https://docs.tusky.io |
| Seal Docs | https://seal-docs.wal.app |
| Sui dApp Kit | https://sdk.mystenlabs.com/dapp-kit |
| awesome-walrus | https://github.com/MystenLabs/awesome-walrus |
| Sui Docs — Walrus | https://docs.sui.io/sui-stack/walrus/sui-stack-walrus |
| Upload relay demo | https://relay.wal.app |
| Walrus Cost Calculator | https://blobboard.xyz |
| Nami Cloud (managed) | https://namicloud.io |
| Walrus Explorer | https://walruscan.com |
| Railway 1-click deploy | https://railway.com/deploy/walrus-publisheraggregator |

---

*Last researched: May 2026. Walrus is actively developed — check docs.wal.app for breaking changes.*

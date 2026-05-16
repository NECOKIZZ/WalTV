// Walrus decentralized storage client.
//
// This module replaces the previous Supabase Storage layer. It uses the
// Walrus Publisher/Aggregator HTTP API directly — no SDK, no wallet
// required at this stage. The publisher accepts a PUT, registers the blob
// on Sui, and returns a content-addressed `blobId`. The aggregator serves
// reads at `${aggregator}/v1/blobs/{blobId}`, which can be dropped straight
// into <img> / <video> / <a href> tags.
//
// Network is selected via `VITE_WALRUS_NETWORK` (testnet | mainnet).
// Switching networks is a one-line env change — see walrus-integration-guide.md.

type WalrusNetwork = 'testnet' | 'mainnet';

interface WalrusNetworkConfig {
  network: WalrusNetwork;
  publisher: string;
  aggregator: string;
  defaultEpochs: number;
}

const WALRUS_NETWORKS: Record<WalrusNetwork, WalrusNetworkConfig> = {
  testnet: {
    network: 'testnet',
    publisher: 'https://publisher.walrus-testnet.walrus.space',
    aggregator: 'https://aggregator.walrus-testnet.walrus.space',
    // Testnet epochs are ~1 day. 20 epochs ≈ 3 weeks — covers dev + judging.
    defaultEpochs: 20,
  },
  mainnet: {
    network: 'mainnet',
    publisher: 'https://walrus-mainnet-publisher-1.staketab.org:443',
    aggregator: 'https://aggregator.walrus.space',
    // Mainnet epochs are ~2 weeks. 52 epochs ≈ 2 years.
    defaultEpochs: 52,
  },
};

function readEnv(key: string): string {
  const raw = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof raw === 'string' ? raw.trim() : '';
}

function resolveNetwork(): WalrusNetwork {
  const raw = readEnv('VITE_WALRUS_NETWORK').toLowerCase();
  return raw === 'mainnet' ? 'mainnet' : 'testnet';
}

function resolveEpochs(network: WalrusNetwork): number {
  const key = network === 'mainnet' ? 'VITE_WALRUS_EPOCHS_MAINNET' : 'VITE_WALRUS_EPOCHS_TESTNET';
  const raw = readEnv(key);
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return WALRUS_NETWORKS[network].defaultEpochs;
}

const network = resolveNetwork();
const baseConfig = WALRUS_NETWORKS[network];

// Allow per-deployment overrides so a self-hosted publisher / paid aggregator
// can be plugged in without a code change.
const publisher = readEnv('VITE_WALRUS_PUBLISHER_URL') || baseConfig.publisher;
const aggregator = readEnv('VITE_WALRUS_AGGREGATOR_URL') || baseConfig.aggregator;
const sendObjectTo = readEnv('VITE_WALRUS_SEND_OBJECT_TO');

export const walrusConfig = {
  network,
  publisher,
  aggregator,
  defaultEpochs: resolveEpochs(network),
  // When set, the underlying Sui blob object is transferred to this address.
  // Required on shared mainnet publishers to retain ownership; optional on
  // testnet. Empty string = let the publisher's sub-wallet keep ownership.
  sendObjectTo,
};

export const isWalrusConfigured = walrusConfig.publisher.length > 0 && walrusConfig.aggregator.length > 0;

// Public publishers cap uploads at 10 MiB. We surface a clear error before the
// network call so users don't wait for a vague 413.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface WalrusPublishOptions {
  epochs?: number;
  deletable?: boolean;
  sendObjectTo?: string;
  signal?: AbortSignal;
}

export interface WalrusPublishResult {
  blobId: string;
  url: string;
  size: number;
  // Sui object id of the blob, when the publisher returns one (newlyCreated).
  blobObjectId?: string;
}

interface PublisherResponse {
  newlyCreated?: {
    blobObject?: {
      blobId?: string;
      id?: string;
      size?: number;
      encodedSize?: number;
    };
  };
  alreadyCertified?: {
    blobId?: string;
    endEpoch?: number;
  };
}

export function walrusBlobUrl(blobId: string): string {
  return `${walrusConfig.aggregator}/v1/blobs/${blobId}`;
}

export function extractWalrusBlobIdFromUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  try {
    const parsed = new URL(value);
    const marker = '/v1/blobs/';
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) {
      return null;
    }
    const id = parsed.pathname.slice(idx + marker.length);
    return id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

export async function walrusPublishBlob(
  file: File | Blob,
  options: WalrusPublishOptions = {},
): Promise<WalrusPublishResult> {
  if (!isWalrusConfigured) {
    throw new Error(
      'Walrus is not configured. Set VITE_WALRUS_NETWORK (and optional VITE_WALRUS_PUBLISHER_URL / VITE_WALRUS_AGGREGATOR_URL).',
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `File is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The Walrus public publisher caps uploads at 10 MB. Compress the media or run a self-hosted publisher.`,
    );
  }

  const epochs = options.epochs ?? walrusConfig.defaultEpochs;
  const deletable = options.deletable ?? false;
  const sendTo = options.sendObjectTo ?? walrusConfig.sendObjectTo;

  const params = new URLSearchParams();
  params.set('epochs', String(epochs));
  if (deletable) {
    params.set('deletable', 'true');
  }
  if (sendTo) {
    params.set('send_object_to', sendTo);
  }

  const contentType = file instanceof File && file.type ? file.type : 'application/octet-stream';

  let response: Response;
  try {
    response = await fetch(`${walrusConfig.publisher}/v1/blobs?${params.toString()}`, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': contentType },
      signal: options.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not reach Walrus publisher (${walrusConfig.publisher}). Check your connection. Underlying error: ${message}`,
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Walrus publisher returned ${response.status}${text ? `: ${text.slice(0, 240)}` : ''}.`,
    );
  }

  let payload: PublisherResponse;
  try {
    payload = (await response.json()) as PublisherResponse;
  } catch {
    throw new Error('Walrus publisher returned a non-JSON response.');
  }

  const newlyCreatedId = payload.newlyCreated?.blobObject?.blobId;
  const alreadyCertifiedId = payload.alreadyCertified?.blobId;
  const blobId = newlyCreatedId ?? alreadyCertifiedId;

  if (!blobId) {
    throw new Error('Walrus publisher response did not contain a blobId.');
  }

  return {
    blobId,
    url: walrusBlobUrl(blobId),
    size: payload.newlyCreated?.blobObject?.size ?? file.size,
    blobObjectId: payload.newlyCreated?.blobObject?.id,
  };
}

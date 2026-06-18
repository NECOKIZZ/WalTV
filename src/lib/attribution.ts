import { Transaction } from '@mysten/sui/transactions';
import type { Signer } from '@mysten/sui/cryptography';
import { suiNetwork } from './sui';
import { sponsorAndExecuteTx } from './sponsored-tx';

const CLOCK_OBJECT_ID = '0x6';
const ATTRIBUTION_MODULE = 'attribution';
const ATTRIBUTION_RECORD_TYPE = `${ATTRIBUTION_MODULE}::AttributionRecord`;

function readEnv(key: string): string {
  const raw = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof raw === 'string' ? raw.trim() : '';
}

function normalizePackageId(value: string) {
  return value.replace(/:+$/, '');
}

function utf8Bytes(value: string | null | undefined) {
  return Array.from(new TextEncoder().encode(value ?? ''));
}

function isCreatedAttributionObject(change: unknown, packageId: string): change is { objectId: string; objectType: string } {
  if (!change || typeof change !== 'object') {
    return false;
  }

  const entry = change as Record<string, unknown>;
  return entry.type === 'created'
    && typeof entry.objectId === 'string'
    && typeof entry.objectType === 'string'
    && entry.objectType.includes(`${packageId}::${ATTRIBUTION_RECORD_TYPE}`);
}

export const attributionPackageId = normalizePackageId(readEnv('VITE_WALTUBE_ATTRIBUTION_PACKAGE_ID'));
export const isAttributionConfigured = attributionPackageId.length > 0;

export interface OnchainAttributionResult {
  attributionObjectId: string | null;
  txDigest: string;
}

interface SuiClientLike {
  signAndExecuteTransaction(input: {
    transaction: Transaction;
    signer: Signer;
    options?: {
      showEffects?: boolean;
      showObjectChanges?: boolean;
    };
  }): Promise<{
    digest: string;
    objectChanges?: unknown[] | null;
  }>;
  waitForTransaction(input: {
    digest: string;
    options?: {
      showEffects?: boolean;
      showObjectChanges?: boolean;
      showBalanceChanges?: boolean;
    };
  }): Promise<{
    digest: string;
    effects?: { status?: { status?: string; error?: string } } | null;
    objectChanges?: unknown[] | null;
    balanceChanges?: unknown[] | null;
  }>;
}

// EnokiFlow shape — getKeypair returns an EnokiKeypair (extends Signer) which
// also exposes signTransaction + toSuiAddress used by the sponsored path.
// The unsponsored path only needs the Signer surface so this stays compatible.
interface EnokiFlowLike {
  enokiClient: unknown;
  getKeypair(input: { network: typeof suiNetwork }): Promise<Signer & {
    toSuiAddress(): string;
    signTransaction(bytes: Uint8Array): Promise<{ signature: string; bytes: string }>;
  }>;
}

export function buildRecordPromptAttributionTx(input: {
  promptId: string;
  contentBlobId: string;
  metadataBlobId?: string;
}) {
  if (!isAttributionConfigured) {
    throw new Error('Move attribution package is not configured. Set VITE_WALTUBE_ATTRIBUTION_PACKAGE_ID.');
  }

  const tx = new Transaction();
  tx.moveCall({
    target: `${attributionPackageId}::${ATTRIBUTION_MODULE}::record_prompt`,
    arguments: [
      tx.pure.vector('u8', utf8Bytes(input.promptId)),
      tx.pure.vector('u8', utf8Bytes(input.contentBlobId)),
      tx.pure.vector('u8', utf8Bytes(input.metadataBlobId)),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

export function buildRecordForkAttributionTx(input: {
  parentAttributionObjectId: string;
  promptId: string;
  contentBlobId: string;
  metadataBlobId?: string;
}) {
  if (!isAttributionConfigured) {
    throw new Error('Move attribution package is not configured. Set VITE_WALTUBE_ATTRIBUTION_PACKAGE_ID.');
  }

  const tx = new Transaction();
  tx.moveCall({
    target: `${attributionPackageId}::${ATTRIBUTION_MODULE}::record_fork`,
    arguments: [
      tx.object(input.parentAttributionObjectId),
      tx.pure.vector('u8', utf8Bytes(input.promptId)),
      tx.pure.vector('u8', utf8Bytes(input.contentBlobId)),
      tx.pure.vector('u8', utf8Bytes(input.metadataBlobId)),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

async function executeAttributionTx(
  tx: Transaction,
  enokiFlow: EnokiFlowLike,
  suiClient: SuiClientLike,
  allowedMoveCallTargets?: string[],
): Promise<OnchainAttributionResult> {
  // Try sponsored path first — Enoki pays the gas. If anything fails (budget
  // exhausted, target not allowlisted, network issue), fall back to user-paid
  // so attribution still happens and the app keeps working.
  try {
    // The shared helper accepts the wider EnokiFlow + SuiClient surfaces.
    // Cast through unknown to satisfy structural matching on enokiClient.
    const sponsoredResult = await sponsorAndExecuteTx(
      tx,
      enokiFlow as unknown as Parameters<typeof sponsorAndExecuteTx>[1],
      suiClient,
      { showObjectChanges: true, showEffects: true, allowedMoveCallTargets },
    );

    const created = sponsoredResult.objectChanges?.find((change) =>
      isCreatedAttributionObject(change, attributionPackageId),
    );

    console.log('[attribution] sponsored tx ok:', sponsoredResult.digest);
    return {
      attributionObjectId: created?.objectId ?? null,
      txDigest: sponsoredResult.digest,
    };
  } catch (sponsorError) {
    console.warn(
      '[attribution] sponsored tx failed — falling back to user-paid. Reason:',
      sponsorError instanceof Error ? sponsorError.message : sponsorError,
    );
  }

  // Fallback: user signs and pays.
  const signer = await enokiFlow.getKeypair({ network: suiNetwork });
  const result = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  const created = result.objectChanges?.find((change) =>
    isCreatedAttributionObject(change, attributionPackageId),
  );

  return {
    attributionObjectId: created?.objectId ?? null,
    txDigest: result.digest,
  };
}

export async function recordPromptAttributionOnchain(
  input: {
    promptId: string;
    contentBlobId: string;
    metadataBlobId?: string;
  },
  enokiFlow: EnokiFlowLike,
  suiClient: SuiClientLike,
) {
  return executeAttributionTx(
    buildRecordPromptAttributionTx(input),
    enokiFlow,
    suiClient,
    [`${attributionPackageId}::${ATTRIBUTION_MODULE}::record_prompt`],
  );
}

export async function recordForkAttributionOnchain(
  input: {
    parentAttributionObjectId: string;
    promptId: string;
    contentBlobId: string;
    metadataBlobId?: string;
  },
  enokiFlow: EnokiFlowLike,
  suiClient: SuiClientLike,
) {
  return executeAttributionTx(
    buildRecordForkAttributionTx(input),
    enokiFlow,
    suiClient,
    [`${attributionPackageId}::${ATTRIBUTION_MODULE}::record_fork`],
  );
}

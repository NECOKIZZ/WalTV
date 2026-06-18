// Shared helper for executing transactions via Enoki's sponsored transaction
// flow. The user signs the transaction (so they remain the sender of record),
// but Enoki pays the gas. Used for actions where we want zero-gas UX —
// posting, forking, and creating royalty configs.
//
// Things NOT routed through here (and which still cost the user gas):
//  - Withdraws from the wallet modal (anti-drain)
//  - Paid likes (user actively spending into the creator economy)
//
// Falls back to user-paid execution when sponsorship is impossible —
// budget exhausted on the Enoki side, target not allowlisted, network down,
// etc. The caller can decide whether to surface the fallback to the user.

import type { Transaction } from '@mysten/sui/transactions';
import { fromBase64, toBase64 } from '@mysten/sui/utils';
import { suiNetwork } from './sui';

interface EnokiClientLike {
  createSponsoredTransaction(input: {
    network: typeof suiNetwork;
    transactionKindBytes: string;
    sender: string;
    allowedAddresses?: string[];
    allowedMoveCallTargets?: string[];
  }): Promise<{ bytes: string; digest: string }>;
  executeSponsoredTransaction(input: {
    digest: string;
    signature: string;
  }): Promise<{ digest: string }>;
}

interface EnokiKeypairLike {
  toSuiAddress(): string;
  signTransaction(bytes: Uint8Array): Promise<{ signature: string; bytes: string }>;
}

interface EnokiFlowLike {
  enokiClient: EnokiClientLike;
  getKeypair(input: { network: typeof suiNetwork }): Promise<EnokiKeypairLike>;
}

interface SuiClientLike {
  waitForTransaction(input: {
    digest: string;
    options?: {
      showEffects?: boolean;
      showObjectChanges?: boolean;
      showBalanceChanges?: boolean;
    };
  }): Promise<SponsoredTxResult>;
}

export interface SponsoredTxResult {
  digest: string;
  effects?: {
    status?: {
      status?: string;
      error?: string;
    };
  } | null;
  objectChanges?: unknown[] | null;
  balanceChanges?: unknown[] | null;
}

export interface SponsorOptions {
  showEffects?: boolean;
  showObjectChanges?: boolean;
  showBalanceChanges?: boolean;
  /** Anti-abuse: only these Move function targets are allowed (e.g.
   *  "0xPKG::attribution::record_prompt"). Required in production.
   */
  allowedMoveCallTargets?: string[];
  /** Anti-abuse: only these addresses may appear as recipients.
   *  Defaults to [sender] if not provided.
   */
  allowedAddresses?: string[];
}

/** Build the transaction kind bytes, ask Enoki to sponsor, get the user's
 *  signature, execute, and wait for finality. Throws on Enoki errors and on
 *  Move execution failure. */
export async function sponsorAndExecuteTx(
  tx: Transaction,
  enokiFlow: EnokiFlowLike,
  // SuiClient is structurally compatible with what tx.build expects via its
  // core RPC surface. We loosen the type here because our call sites also
  // hand us SuiClientLike-shaped wrappers.
  suiClient: SuiClientLike,
  options: SponsorOptions = {},
): Promise<SponsoredTxResult> {
  const keypair = await enokiFlow.getKeypair({ network: suiNetwork });
  const sender = keypair.toSuiAddress();

  // 1. Build kind-only bytes (no gas data — Enoki fills that in).
  //    onlyTransactionKind does not need a client.
  const kindBytes = await tx.build({
    onlyTransactionKind: true,
  });

  const transactionKindBytes = toBase64(kindBytes);
  const allowedAddresses = options.allowedAddresses ?? [sender];
  const allowedMoveCallTargets = options.allowedMoveCallTargets ?? [];

  // 2. Production: route through backend API (holds private key).
  //    Development: call Enoki directly (public key, same as before).
  let sponsored: { bytes: string; digest: string };

  if (import.meta.env.PROD) {
    sponsored = await sponsorViaBackend({
      network: suiNetwork,
      transactionKindBytes,
      sender,
      allowedAddresses,
      allowedMoveCallTargets,
    });
  } else {
    sponsored = await enokiFlow.enokiClient.createSponsoredTransaction({
      network: suiNetwork,
      transactionKindBytes,
      sender,
      allowedAddresses,
      allowedMoveCallTargets,
    });
  }

  // 3. User signs the wrapped bytes (proves they authorize the call).
  const userSig = await keypair.signTransaction(fromBase64(sponsored.bytes));

  // 4. Hand the user signature back for final execution.
  if (import.meta.env.PROD) {
    await executeViaBackend({
      digest: sponsored.digest,
      signature: userSig.signature,
    });
  } else {
    await enokiFlow.enokiClient.executeSponsoredTransaction({
      digest: sponsored.digest,
      signature: userSig.signature,
    });
  }

  // 5. Wait for finality and fetch the full result.
  const result = await suiClient.waitForTransaction({
    digest: sponsored.digest,
    options: {
      showEffects: options.showEffects ?? true,
      showObjectChanges: options.showObjectChanges ?? true,
      showBalanceChanges: options.showBalanceChanges ?? true,
    },
  });

  const status = result.effects?.status?.status;
  if (status && status !== 'success') {
    throw new Error(result.effects?.status?.error || 'Sponsored transaction failed.');
  }

  return result;
}

// ---------------------------------------------------------------------------
// Backend API helpers (production only)
// ---------------------------------------------------------------------------

interface SponsorBackendRequest {
  network: string;
  transactionKindBytes: string;
  sender: string;
  allowedAddresses: string[];
  allowedMoveCallTargets: string[];
}

async function sponsorViaBackend(
  params: SponsorBackendRequest,
): Promise<{ bytes: string; digest: string }> {
  const res = await fetch('/api/enoki/sponsor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sponsor backend failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<{ bytes: string; digest: string }>;
}

interface ExecuteBackendRequest {
  digest: string;
  signature: string;
}

async function executeViaBackend(params: ExecuteBackendRequest): Promise<void> {
  const res = await fetch('/api/enoki/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Execute backend failed (${res.status}): ${body}`);
  }
}

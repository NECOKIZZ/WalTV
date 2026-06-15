import { Transaction } from '@mysten/sui/transactions';
import type { Signer } from '@mysten/sui/cryptography';
import { suiNetwork } from './sui';
import { sponsorAndExecuteTx } from './sponsored-tx';

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

export const royaltiesPackageId = normalizePackageId(readEnv('VITE_WALTUBE_ROYALTIES_PACKAGE_ID'));
export const royaltiesRegistryId = normalizePackageId(readEnv('VITE_WALTUBE_ROYALTIES_REGISTRY_ID'));
export const isRoyaltiesConfigured = royaltiesPackageId.length > 0 && royaltiesRegistryId.length > 0;
export const isForkRoyaltiesEnabled = isRoyaltiesConfigured && readEnv('VITE_ENABLE_FORK_ROYALTIES') === 'true';

export interface RoyaltyRecipient {
  address: string;
  shareBps: number;
}

export interface RoyaltyPaymentResult {
  txDigest: string;
  amountMist: string;
  amountSui: string;
  network: typeof suiNetwork;
  recipientCount: number;
}

interface SuiClientLike {
  signAndExecuteTransaction(input: {
    transaction: Transaction;
    signer: Signer;
    options?: {
      showEffects?: boolean;
      showBalanceChanges?: boolean;
      showObjectChanges?: boolean;
    };
  }): Promise<{
    digest: string;
    effects?: {
      status?: {
        status?: string;
        error?: string;
      };
    } | null;
    objectChanges?: unknown[] | null;
    balanceChanges?: unknown[] | null;
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

interface EnokiFlowLike {
  enokiClient: unknown;
  getKeypair(input: { network: typeof suiNetwork }): Promise<Signer & {
    toSuiAddress(): string;
    signTransaction(bytes: Uint8Array): Promise<{ signature: string; bytes: string }>;
  }>;
}

// ─── Build transactions ────────────────────────────────────────

export function buildCreateRoyaltyConfigTx(input: {
  promptId: string;
  recipients: RoyaltyRecipient[];
}) {
  if (!isRoyaltiesConfigured) {
    throw new Error('Royalties package is not configured. Set VITE_WALTUBE_ROYALTIES_PACKAGE_ID and VITE_WALTUBE_ROYALTIES_REGISTRY_ID.');
  }

  const addresses = input.recipients.map((r) => r.address);
  const shares = input.recipients.map((r) => r.shareBps);

  const tx = new Transaction();
  tx.moveCall({
    target: `${royaltiesPackageId}::royalties::create_royalty_config`,
    arguments: [
      tx.object(royaltiesRegistryId),
      tx.pure.vector('u8', utf8Bytes(input.promptId)),
      tx.pure.vector('address', addresses),
      tx.pure.vector('u64', shares),
    ],
  });
  return tx;
}

export function buildReceivePaymentTx(input: {
  royaltyConfigId: string;
  amountMist: bigint;
}) {
  if (!isRoyaltiesConfigured) {
    throw new Error('Royalties package is not configured.');
  }

  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(input.amountMist.toString())]);
  tx.moveCall({
    target: `${royaltiesPackageId}::royalties::receive_payment`,
    arguments: [
      tx.object(input.royaltyConfigId),
      coin,
    ],
  });
  return tx;
}

// ─── Execute ───────────────────────────────────────────────────

function isCreatedRoyaltyConfig(change: unknown): change is { objectId: string; objectType: string } {
  if (!change || typeof change !== 'object') return false;
  const entry = change as Record<string, unknown>;
  return (
    entry.type === 'created' &&
    typeof entry.objectId === 'string' &&
    typeof entry.objectType === 'string' &&
    entry.objectType.includes(`${royaltiesPackageId}::royalties::RoyaltyConfig`)
  );
}

async function executeTx(
  tx: Transaction,
  enokiFlow: EnokiFlowLike,
  suiClient: SuiClientLike,
  options: { sponsored?: boolean } = {},
): Promise<{ txDigest: string; objectChanges?: unknown[] | null; balanceChanges?: unknown[] | null }> {
  // Sponsored path — Enoki pays gas. Used for fork-time royalty config
  // creation so creators can fork without owning SUI. Falls back to
  // user-paid if Enoki sponsorship fails for any reason.
  if (options.sponsored) {
    try {
      const sponsoredResult = await sponsorAndExecuteTx(
        tx,
        enokiFlow as unknown as Parameters<typeof sponsorAndExecuteTx>[1],
        suiClient,
        { showEffects: true, showObjectChanges: true, showBalanceChanges: true },
      );
      console.log('[royalties] sponsored tx ok:', sponsoredResult.digest);
      return {
        txDigest: sponsoredResult.digest,
        objectChanges: sponsoredResult.objectChanges,
        balanceChanges: sponsoredResult.balanceChanges,
      };
    } catch (sponsorError) {
      console.warn(
        '[royalties] sponsored tx failed — falling back to user-paid. Reason:',
        sponsorError instanceof Error ? sponsorError.message : sponsorError,
      );
    }
  }

  // User-paid path — used for paid likes (sendRoyaltyPayment) and as the
  // fallback when sponsorship is unavailable.
  const signer = await enokiFlow.getKeypair({ network: suiNetwork });
  const result = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: {
      showEffects: true,
      showBalanceChanges: true,
      showObjectChanges: true,
    },
  });

  const status = result.effects?.status?.status;
  if (status && status !== 'success') {
    throw new Error(result.effects?.status?.error || 'Sui transaction failed.');
  }

  return { txDigest: result.digest, objectChanges: result.objectChanges, balanceChanges: result.balanceChanges };
}

export async function createRoyaltyConfigOnchain(
  input: {
    promptId: string;
    recipients: RoyaltyRecipient[];
  },
  enokiFlow: EnokiFlowLike,
  suiClient: SuiClientLike,
): Promise<{ txDigest: string; royaltyConfigId: string | null }> {
  // Sponsored — creating a royalty config is part of forking, which we cover.
  const { txDigest, objectChanges } = await executeTx(
    buildCreateRoyaltyConfigTx(input),
    enokiFlow,
    suiClient,
    { sponsored: true },
  );

  const created = objectChanges?.find((change) => isCreatedRoyaltyConfig(change));
  return { txDigest, royaltyConfigId: created?.objectId ?? null };
}

export async function sendRoyaltyPayment(
  input: {
    royaltyConfigId: string;
    amountMist: bigint;
  },
  enokiFlow: EnokiFlowLike,
  suiClient: SuiClientLike,
): Promise<RoyaltyPaymentResult> {
  const { txDigest, balanceChanges } = await executeTx(buildReceivePaymentTx(input), enokiFlow, suiClient);
  const amountSui = formatMistAsSui(input.amountMist);

  // Log per-address balance changes so devs can verify the split happened.
  if (Array.isArray(balanceChanges) && balanceChanges.length > 0) {
    const summary = balanceChanges.map((entry) => {
      const change = entry as { owner?: { AddressOwner?: string }; amount?: string; coinType?: string };
      const addr = change.owner?.AddressOwner ?? 'unknown';
      const amount = change.amount ?? '0';
      return { address: addr, amountMist: amount, amountSui: formatMistAsSui(BigInt(amount.replace(/^-/, '')) * (amount.startsWith('-') ? -1n : 1n)) };
    });
    console.log('[royalties] payment split:', summary);
  }

  return {
    txDigest,
    amountMist: input.amountMist.toString(),
    amountSui,
    network: suiNetwork,
    recipientCount: 0,
  };
}

// ─── Helpers ───────────────────────────────────────────────────

export function formatMistAsSui(amountMist: bigint) {
  const whole = amountMist / 1_000_000_000n;
  const fraction = amountMist % 1_000_000_000n;
  const fractionText = fraction.toString().padStart(9, '0').replace(/0+$/, '');
  return fractionText ? `${whole}.${fractionText}` : whole.toString();
}

/** Compute royalty recipients from a fork chain.
 *  Original creator gets 5%, each fork parent gets a decaying share,
 *  current creator gets the remainder.
 */
export function computeRoyaltyRecipients(
  chain: { authorAddress: string }[],
): RoyaltyRecipient[] {
  if (chain.length === 0) {
    throw new Error('Cannot compute royalty recipients from empty chain.');
  }

  // If only the original (no forks), no royalty split needed.
  if (chain.length === 1) {
    return [{ address: chain[0].authorAddress, shareBps: 10_000 }];
  }

  const recipients: RoyaltyRecipient[] = [];
  let totalAllocated = 0;

  // Original creator: 5%
  recipients.push({ address: chain[0].authorAddress, shareBps: 500 });
  totalAllocated += 500;

  // Intermediate fork creators: 3%, 2%, etc. (capped so current creator keeps at least 80%)
  for (let i = 1; i < chain.length - 1; i++) {
    const share = Math.max(100, 400 - (i - 1) * 100); // 300, 200, 100...
    recipients.push({ address: chain[i].authorAddress, shareBps: share });
    totalAllocated += share;
  }

  // Current creator gets the remainder
  const currentShare = 10_000 - totalAllocated;
  recipients.push({ address: chain[chain.length - 1].authorAddress, shareBps: currentShare });

  return recipients;
}

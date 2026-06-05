import { Transaction } from '@mysten/sui/transactions';
import type { Signer } from '@mysten/sui/cryptography';
import { suiNetwork } from './sui';

function readEnv(key: string): string {
  const raw = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof raw === 'string' ? raw.trim() : '';
}

function readBooleanEnv(key: string, fallback: boolean) {
  const raw = readEnv(key).toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

function readMistEnv(key: string, fallback: bigint) {
  const raw = readEnv(key);
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = BigInt(raw);
    return parsed > 0n ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export const isSuiPaidLikesEnabled = readBooleanEnv('VITE_ENABLE_SUI_PAID_LIKES', true);
export const paidLikeAmountMist = readMistEnv('VITE_SUI_PAID_LIKE_MIST', 1_000_000n);

export function isSuiAddress(value: string | null | undefined) {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function formatMistAsSui(amountMist: bigint) {
  const whole = amountMist / 1_000_000_000n;
  const fraction = amountMist % 1_000_000_000n;
  const fractionText = fraction.toString().padStart(9, '0').replace(/0+$/, '');
  return fractionText ? `${whole}.${fractionText}` : whole.toString();
}

interface SuiClientLike {
  signAndExecuteTransaction(input: {
    transaction: Transaction;
    signer: Signer;
    options?: {
      showEffects?: boolean;
      showBalanceChanges?: boolean;
    };
  }): Promise<{
    digest: string;
    effects?: {
      status?: {
        status?: string;
        error?: string;
      };
    } | null;
  }>;
}

interface EnokiFlowLike {
  getKeypair(input: { network: typeof suiNetwork }): Promise<Signer>;
}

export interface SuiPaymentResult {
  txDigest: string;
  amountMist: string;
  amountSui: string;
  network: typeof suiNetwork;
}

export async function sendSuiPayment(
  input: {
    recipient: string;
    amountMist?: bigint;
  },
  enokiFlow: EnokiFlowLike,
  suiClient: SuiClientLike,
): Promise<SuiPaymentResult> {
  if (!isSuiAddress(input.recipient)) {
    throw new Error('Recipient is not a valid Sui address.');
  }

  const amountMist = input.amountMist ?? paidLikeAmountMist;
  if (amountMist <= 0n) {
    throw new Error('Payment amount must be greater than zero.');
  }

  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist.toString())]);
  tx.transferObjects([coin], input.recipient);

  const signer = await enokiFlow.getKeypair({ network: suiNetwork });
  const result = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: {
      showEffects: true,
      showBalanceChanges: true,
    },
  });

  const status = result.effects?.status?.status;
  if (status && status !== 'success') {
    throw new Error(result.effects?.status?.error || 'SUI payment failed.');
  }

  return {
    txDigest: result.digest,
    amountMist: amountMist.toString(),
    amountSui: formatMistAsSui(amountMist),
    network: suiNetwork,
  };
}

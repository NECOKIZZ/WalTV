// Seal SDK wrapper for WalTube Premium Workflows.
//
// Seal uses Identity-Based Encryption (IBE) with threshold key servers.
// You do NOT generate or manage AES keys — the SDK handles encryption
// internally. Access control is defined by the `seal_approve` Move function
// in `move/waltube_premium/sources/premium.move`.
//
// ─── Identity model (important) ──────────────────────────────
// The IBE identity for a premium workflow is the on-chain
// `WorkflowAccessPolicy` object id (hex bytes, no 0x). Object ids are
// globally unique and unforgeable, so an attacker cannot mint a competing
// policy whose id matches an already-encrypted blob. This is what makes the
// paywall sound. Consequence: the policy must be created BEFORE encrypting,
// because its id is the encryption identity.
//
// Flow:
//   1. Creator creates the access policy onchain:
//        create_access_policy(priceMist) → shared WorkflowAccessPolicy object
//      The new object id becomes the Seal `id` (identity).
//   2. Creator encrypts steps[] using that id, stores ciphertext in Walrus.
//   3. Viewer pays via pay_and_unlock(policy, payment) → added to allowlist.
//   4. Viewer decrypts:
//      a. Create SessionKey (requires wallet signature once per TTL)
//      b. Build PTB calling seal_approve(policyIdBytes, policy)
//      c. sealClient.decrypt({ data, sessionKey, txBytes })

import { SealClient, SessionKey } from '@mysten/seal';
import { Transaction } from '@mysten/sui/transactions';
import { fromHex } from '@mysten/sui/utils';
import type { Signer } from '@mysten/sui/cryptography';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

import type { WorkflowStep, WorkflowStepCreateInput } from './types';

// ─── Configuration ───────────────────────────────────────────

// Testnet Seal key server object IDs.
// Source: seal-docs.wal.app / official Seal SDK getting-started guide.
const TESTNET_KEY_SERVERS = [
  { objectId: '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75', weight: 1 },
  { objectId: '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8', weight: 1 },
];

function readEnv(key: string): string {
  const raw = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof raw === 'string' ? raw.trim() : '';
}

// Verify key servers in production. Defaults to true; set
// VITE_SEAL_VERIFY_KEY_SERVERS=false only for local dev against flaky servers.
function shouldVerifyKeyServers(): boolean {
  return readEnv('VITE_SEAL_VERIFY_KEY_SERVERS').toLowerCase() !== 'false';
}

// Lightweight, namespaced logger so the encryption/decryption lifecycle is
// actually visible in dev tools. Previously these paths were silent, which is
// why nothing showed up. Set VITE_SEAL_DEBUG=false to silence.
const sealDebugEnabled = readEnv('VITE_SEAL_DEBUG').toLowerCase() !== 'false';
function sealLog(...args: unknown[]) {
  if (sealDebugEnabled) {
    // eslint-disable-next-line no-console
    console.log('%c[seal]', 'color:#f5a623;font-weight:bold', ...args);
  }
}

// TODO: Set this after deploying move/waltube_premium.
let _packageId: string | null = null;

export function setSealPackageId(id: string) {
  _packageId = id;
}

export function getSealPackageId(): string {
  if (!_packageId) {
    const envId = readEnv('VITE_SEAL_PACKAGE_ID');
    if (envId) {
      _packageId = envId;
      return envId;
    }
    return '';
  }
  return _packageId;
}

/** Feature flag — premium UI and encryption only appear when this is true. */
export function isSealPremiumEnabled(): boolean {
  return !!getSealPackageId();
}

// The Seal `id` is a hex string (decoded via fromHex by the SDK). On-chain we
// compare the same bytes against `object::uid_to_bytes(&policy.id)`. A Sui
// object id is a 0x-prefixed 32-byte hex string; strip the prefix so encrypt,
// decrypt, and the Move check all agree on the exact same byte sequence.
export function policyIdToSealIdentity(policyObjectId: string): string {
  return policyObjectId.startsWith('0x') ? policyObjectId.slice(2) : policyObjectId;
}

// ─── Client Setup ──────────────────────────────────────────────

/**
 * Create a SealClient bound to the given SuiJsonRpcClient.
 * Call once and reuse for encrypt / decrypt operations.
 */
export function createSealClient(suiClient: SuiJsonRpcClient) {
  return new SealClient({
    suiClient: suiClient as never,
    serverConfigs: TESTNET_KEY_SERVERS,
    verifyKeyServers: shouldVerifyKeyServers(),
    timeout: 15000,
  });
}

// ─── Encryption ────────────────────────────────────────────────

export interface EncryptedWorkflowPayload {
  /** The encrypted bytes to store in Walrus (or anywhere). */
  encryptedObject: Uint8Array;
  /** Backup symmetric key (optional — for disaster recovery via CLI). */
  backupKey?: Uint8Array;
}

/**
 * Encrypt a workflow's steps[] before uploading to Walrus.
 *
 * @param steps           The full steps array (will be JSON-serialized).
 * @param policyObjectId  The on-chain WorkflowAccessPolicy object id. Its
 *                        hex bytes are the IBE identity.
 * @param sealClient      A SealClient from createSealClient().
 * @param threshold       Number of key servers required for decryption (default 2).
 */
export async function encryptWorkflowSteps(
  steps: WorkflowStep[] | WorkflowStepCreateInput[],
  policyObjectId: string,
  sealClient: SealClient,
  threshold = 2,
): Promise<EncryptedWorkflowPayload> {
  const packageId = getSealPackageId();
  const id = policyIdToSealIdentity(policyObjectId);
  const data = new TextEncoder().encode(JSON.stringify(steps));

  sealLog('encrypt → start', {
    packageId,
    identity: id,
    threshold,
    plaintextBytes: data.length,
    stepCount: steps.length,
  });

  try {
    const { encryptedObject, key } = await sealClient.encrypt({
      threshold,
      packageId,
      id,
      data,
    });

    sealLog('encrypt → done', { ciphertextBytes: encryptedObject.length });

    return {
      encryptedObject,
      backupKey: key,
    };
  } catch (error) {
    sealLog('encrypt → FAILED', error);
    throw error;
  }
}

// ─── Decryption ────────────────────────────────────────────────

/**
 * Decrypt workflow steps after the viewer has paid (or is the creator).
 *
 * This requires:
 *   1. A SessionKey (created once per TTL, signed by the user's wallet).
 *   2. A PTB that calls `seal_approve` with the policy id bytes and policy object.
 *
 * @param encryptedObject   The encrypted bytes from Walrus.
 * @param policyObjectId    The onchain `WorkflowAccessPolicy` shared object ID
 *                          (this IS the IBE identity).
 * @param sealClient        A SealClient from createSealClient().
 * @param signer            The user's Enoki/zkLogin signer.
 * @param suiClient         The same SuiJsonRpcClient passed to createSealClient().
 */
export async function decryptWorkflowSteps(
  encryptedObject: Uint8Array,
  policyObjectId: string,
  sealClient: SealClient,
  signer: Signer,
  suiClient: SuiJsonRpcClient,
): Promise<WorkflowStep[]> {
  const packageId = getSealPackageId();
  const identity = policyIdToSealIdentity(policyObjectId);
  const senderAddress = signer.toSuiAddress();

  sealLog('decrypt → start', {
    packageId,
    identity,
    policyObjectId,
    sender: senderAddress,
    ciphertextBytes: encryptedObject.length,
  });

  try {
    // 1. Create or reuse a SessionKey.
    //    If signer is provided, the personal message is signed automatically.
    const sessionKey = await SessionKey.create({
      address: senderAddress,
      packageId,
      ttlMin: 10,
      signer,
      suiClient: suiClient as never,
    });
    sealLog('decrypt → session key ready');

    // 2. Build the PTB that key servers will evaluate via dry_run.
    //    seal_approve aborts → key servers deny shares.
    //    seal_approve succeeds → key servers return shares → decryption.
    //    The first arg must be the identity bytes (= policy id bytes).
    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::premium::seal_approve`,
      arguments: [
        tx.pure.vector('u8', Array.from(fromHex(identity))),
        tx.object(policyObjectId),
      ],
    });

    const txBytes = await tx.build({
      client: suiClient as never,
      onlyTransactionKind: true,
    });
    sealLog('decrypt → seal_approve PTB built, requesting key shares…');

    // 3. Decrypt.
    const decryptedBytes = await sealClient.decrypt({
      data: encryptedObject,
      sessionKey,
      txBytes,
    });
    sealLog('decrypt → shares returned, plaintext recovered', {
      plaintextBytes: decryptedBytes.length,
    });

    const json = new TextDecoder().decode(decryptedBytes);
    const steps = JSON.parse(json) as WorkflowStep[];
    // Normalize: the creator encrypts the draft step shape (no id/stepNumber),
    // so backfill stable values the renderer relies on (React key, ordering).
    return steps.map((step, index) => ({
      ...step,
      id: step.id ?? `step-${index + 1}`,
      stepNumber: step.stepNumber ?? index + 1,
    }));
  } catch (error) {
    sealLog('decrypt → FAILED', error);
    throw error;
  }
}

// ─── Move Transaction Builders ─────────────────────────────────

/**
 * Build a PTB that creates a WorkflowAccessPolicy shared object.
 * The creator calls this FIRST (before encryption), because the resulting
 * object id is the Seal IBE identity.
 */
export function buildCreateAccessPolicyTx(
  priceMist: bigint,
  packageId: string,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::premium::create_access_policy`,
    arguments: [tx.pure.u64(priceMist.toString())],
  });
  return tx;
}

/**
 * Build a PTB that pays and unlocks a premium workflow.
 * The viewer calls this before decrypting.
 */
export function buildPayAndUnlockTx(
  policyObjectId: string,
  priceMist: bigint,
  packageId: string,
): Transaction {
  const tx = new Transaction();
  const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(priceMist.toString())]);
  tx.moveCall({
    target: `${packageId}::premium::pay_and_unlock`,
    arguments: [tx.object(policyObjectId), payment],
  });
  return tx;
}

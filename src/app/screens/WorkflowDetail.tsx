import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Copy,
  Heart,
  Image as ImageIcon,
  Loader2,
  Lock,
  Play,
  Unlock,
  Wand2,
} from 'lucide-react';
import { workflowsApi, workflowUnlocksApi } from '../../lib/backend';
import { useAuth } from '../../lib/auth-context';
import { useBackendQuery } from '../../lib/useBackendQuery';
import { WorkflowGenerationType } from '../../lib/types';
import { getAIModelConfig } from '../../lib/aiModelLogos';
import { createSealClient, decryptWorkflowSteps, buildPayAndUnlockTx, isSealPremiumEnabled } from '../../lib/seal';
import { walrusBlobUrl } from '../../lib/walrus';
import { formatMistAsSui } from '../../lib/sui-payments';
import { useSuiClient } from '@mysten/dapp-kit';
import { useEnokiFlow } from '@mysten/enoki/react';

const generationTypeLabels: Record<WorkflowGenerationType, string> = {
  prompt_to_video: 'Prompt to video',
  image_to_video: 'Image to video',
  frames_to_video: 'Two frames to video',
  prompt_to_image: 'Prompt to image',
  ingredients: 'Ingredients',
};

const generationTypeAccent: Record<WorkflowGenerationType, string> = {
  prompt_to_video: 'bg-sky-500/15 text-sky-200 border-sky-400/30',
  image_to_video: 'bg-indigo-500/15 text-indigo-200 border-indigo-400/30',
  frames_to_video: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30',
  prompt_to_image: 'bg-amber-500/15 text-amber-200 border-amber-400/30',
  ingredients: 'bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/30',
};

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textArea = document.createElement('textarea');
    textArea.value = value;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    document.execCommand('copy');
    textArea.remove();
  }
}

export function WorkflowDetail() {
  const navigate = useNavigate();
  const { workflowId } = useParams();
  const { user: activeUser, isLoading: authIsLoading } = useAuth();
  const suiClient = useSuiClient();
  const enokiFlow = useEnokiFlow();

  const { data: workflowData, isLoading } = useBackendQuery(
    () => (workflowId ? workflowsApi.getWorkflowById(workflowId) : Promise.resolve(null)),
    null,
    [workflowId],
  );
  const { data: likedWorkflowIds } = useBackendQuery(
    () => (activeUser ? workflowsApi.getLikedWorkflowIds(activeUser.uid) : Promise.resolve([])),
    [],
    [activeUser?.uid],
  );
  const { data: savedWorkflowIds } = useBackendQuery(
    () => (activeUser ? workflowsApi.getSavedWorkflowIds(activeUser.uid) : Promise.resolve([])),
    [],
    [activeUser?.uid],
  );

  const [saved, setSaved] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState<number>(0);
  const [copiedStepId, setCopiedStepId] = useState<string | null>(null);
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());

  // Premium workflow state
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isCheckingUnlock, setIsCheckingUnlock] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedSteps, setDecryptedSteps] = useState<typeof workflow.steps | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  // Guards the auto-decrypt effect so it only fires once per workflow.
  const autoDecryptAttemptedRef = useRef(false);

  const premiumFeatureEnabled = isSealPremiumEnabled();

  const isPremium = premiumFeatureEnabled && (workflowData?.isPremium ?? false);
  const isCreator = !!workflowData && workflowData.authorUid === activeUser?.uid;
  const hasAccess = !isPremium || isCreator || isUnlocked || decryptedSteps !== null;
  const displaySteps = decryptedSteps ?? workflowData?.steps ?? [];

  useEffect(() => {
    setLikesCount(workflowData?.likes ?? 0);
  }, [workflowData]);

  useEffect(() => {
    if (!workflowId) {
      return;
    }
    setLiked(likedWorkflowIds.includes(workflowId));
    setSaved(savedWorkflowIds.includes(workflowId));
  }, [likedWorkflowIds, savedWorkflowIds, workflowId]);

  useEffect(() => {
    if (!premiumFeatureEnabled || !workflowData?.isPremium || !activeUser || !workflowId) {
      return;
    }

    if (workflowData.authorUid === activeUser.uid) {
      setIsUnlocked(true);
      return;
    }

    setIsCheckingUnlock(true);
    workflowUnlocksApi
      .isUnlocked(activeUser.uid, workflowId)
      .then((unlocked) => {
        setIsUnlocked(unlocked);
      })
      .finally(() => {
        setIsCheckingUnlock(false);
      });
  }, [workflowData, activeUser, workflowId, premiumFeatureEnabled]);

  // Fetch ciphertext from Walrus and decrypt with Seal. Shared by the
  // post-payment path and the auto-decrypt effect (creator / unlocked viewer).
  const runDecrypt = useCallback(async (): Promise<boolean> => {
    if (!workflowData?.sealEncryptedBlobId || !workflowData.sealAccessPolicyId) {
      setUnlockError('Premium workflow is not fully configured yet.');
      return false;
    }

    setIsDecrypting(true);
    try {
      const keypair = await enokiFlow.getKeypair({ network: 'testnet' });
      const sealClient = createSealClient(suiClient);

      const response = await fetch(walrusBlobUrl(workflowData.sealEncryptedBlobId));
      if (!response.ok) {
        throw new Error(`Could not fetch encrypted blob (${response.status}).`);
      }
      const encryptedBlob = await response.arrayBuffer();

      const decrypted = await decryptWorkflowSteps(
        new Uint8Array(encryptedBlob),
        workflowData.sealAccessPolicyId,
        sealClient,
        keypair,
        suiClient,
      );
      setDecryptedSteps(decrypted);
      setUnlockError(null);
      return true;
    } catch (decryptError) {
      console.error('[premium] Decryption failed:', decryptError);
      setUnlockError(
        decryptError instanceof Error
          ? `Decryption failed: ${decryptError.message}`
          : 'Decryption failed.',
      );
      return false;
    } finally {
      setIsDecrypting(false);
    }
  }, [workflowData, enokiFlow, suiClient]);

  // Auto-decrypt once for users who already have access (creator or a viewer
  // who paid in a previous session). Premium steps are never stored in
  // Firestore, so without this they'd see an empty thread after a refresh.
  useEffect(() => {
    if (!isPremium || !workflowData?.sealEncryptedBlobId) {
      return;
    }
    if (!isCreator && !isUnlocked) {
      return;
    }
    if (decryptedSteps !== null || isDecrypting || autoDecryptAttemptedRef.current) {
      return;
    }
    autoDecryptAttemptedRef.current = true;
    void runDecrypt();
  }, [isPremium, isCreator, isUnlocked, workflowData, decryptedSteps, isDecrypting, runDecrypt]);

  if (isLoading) {
    return (
      <div className="min-h-screen px-4 py-10 md:px-8">
        <div className="mx-auto max-w-2xl rounded-[var(--waltube-r-xl)] border border-[var(--waltube-text-3)] bg-[var(--waltube-surface)] p-8 text-center">
          <p className="font-primary text-2xl text-[var(--waltube-text-1)]">Loading workflow...</p>
        </div>
      </div>
    );
  }

  if (!workflowData) {
    return (
      <div className="min-h-screen px-4 py-10 md:px-8">
        <div className="mx-auto max-w-2xl rounded-[var(--waltube-r-xl)] border border-[var(--waltube-text-3)] bg-[var(--waltube-surface)] p-8 text-center">
          <p className="font-primary text-2xl text-[var(--waltube-text-1)]">Workflow not found</p>
          <button
            onClick={() => navigate('/feed')}
            className="mt-6 rounded-[var(--waltube-r-pill)] bg-[var(--waltube-indigo)] px-5 py-3 font-accent text-sm font-medium text-white"
          >
            Back to feed
          </button>
        </div>
      </div>
    );
  }

  const workflow = workflowData;
  const mediaAspectRatio = workflow.mediaAspectRatio === 'portrait' ? '9 / 16' : '16 / 9';

  const handleToggleLike = async () => {
    if (authIsLoading) {
      return;
    }

    if (!activeUser) {
      navigate('/auth');
      return;
    }

    const wasLiked = liked;
    const previousLikes = likesCount;
    setLiked(!wasLiked);
    setLikesCount(Math.max(0, likesCount + (wasLiked ? -1 : 1)));

    try {
      const result = await workflowsApi.toggleLike(workflow.id, activeUser.uid);
      setLiked(result.liked);
      setLikesCount(result.likes);
    } catch {
      setLiked(wasLiked);
      setLikesCount(previousLikes);
    }
  };

  const handleToggleSave = async () => {
    if (authIsLoading) {
      return;
    }

    if (!activeUser) {
      navigate('/auth');
      return;
    }

    const wasSaved = saved;
    setSaved(!wasSaved);

    try {
      const result = await workflowsApi.toggleSave(workflow.id, activeUser.uid);
      setSaved(result.saved);
    } catch {
      setSaved(wasSaved);
    }
  };

  const handleUnlock = async () => {
    if (!activeUser || !workflowData || !workflowData.isPremium) {
      return;
    }
    if (!workflowData.sealAccessPolicyId || !workflowData.unlockPriceMist || !workflowData.sealPackageId) {
      setUnlockError('Premium workflow is not fully configured yet.');
      return;
    }

    setIsUnlocking(true);
    setUnlockError(null);

    const policyId = workflowData.sealAccessPolicyId;

    // Read the on-chain policy and tell us whether `address` already has access
    // (is the creator, or already in unlocked_users). Used to avoid paying
    // twice when a prior payment succeeded but the off-chain record didn't.
    const isUnlockedOnChain = async (address: string): Promise<boolean> => {
      try {
        const object = await suiClient.getObject({ id: policyId, options: { showContent: true } });
        const content = object.data?.content;
        if (!content || content.dataType !== 'moveObject') {
          return false;
        }
        const fields = content.fields as {
          creator?: string;
          unlocked_users?: { fields?: { contents?: unknown[] } };
        };
        const target = address.toLowerCase();
        if (typeof fields.creator === 'string' && fields.creator.toLowerCase() === target) {
          return true;
        }
        const contents = fields.unlocked_users?.fields?.contents ?? [];
        return contents.some((entry) => String(entry).toLowerCase() === target);
      } catch (lookupError) {
        console.warn('[premium] on-chain unlock check failed:', lookupError);
        return false;
      }
    };

    try {
      const keypair = await enokiFlow.getKeypair({ network: 'testnet' });
      const myAddress = keypair.toSuiAddress();

      let txDigest = 'onchain';

      if (await isUnlockedOnChain(myAddress)) {
        // Already paid on a previous attempt — don't pay again.
        console.info('[premium] already unlocked on-chain, skipping payment');
      } else {
        const tx = buildPayAndUnlockTx(
          policyId,
          BigInt(workflowData.unlockPriceMist),
          workflowData.sealPackageId,
        );

        // Let the client set sender / gas payment / budget from the signer.
        // (Manually building with tx.build() requires an explicit setSender,
        // otherwise it throws "Missing transaction sender".)
        const executeResult = await suiClient.signAndExecuteTransaction({
          transaction: tx,
          signer: keypair,
          options: { showEffects: true },
        });

        if (executeResult.effects?.status?.status !== 'success') {
          throw new Error(
            executeResult.effects?.status?.error ?? 'Payment transaction did not succeed.',
          );
        }
        txDigest = executeResult.digest;
      }

      await workflowUnlocksApi.recordUnlock(activeUser.uid, workflowData.id, {
        creatorUid: workflowData.authorUid,
        amountMist: workflowData.unlockPriceMist,
        txDigest,
        paidAt: new Date(),
      });

      setIsUnlocked(true);
      await runDecrypt();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Safety net: if pay_and_unlock aborted with E_ALREADY_UNLOCKED (code 1),
      // the user already has access — proceed to decrypt instead of failing.
      if (message.includes('abort code: 1') || message.includes('E_ALREADY_UNLOCKED')) {
        console.info('[premium] pay aborted as already-unlocked, proceeding to decrypt');
        setIsUnlocked(true);
        try {
          await workflowUnlocksApi.recordUnlock(activeUser.uid, workflowData.id, {
            creatorUid: workflowData.authorUid,
            amountMist: workflowData.unlockPriceMist,
            txDigest: 'onchain',
            paidAt: new Date(),
          });
        } catch (recordError) {
          console.warn('[premium] could not record existing unlock:', recordError);
        }
        await runDecrypt();
      } else {
        console.error('[premium] Unlock failed:', error);
        setUnlockError(message);
      }
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div className="min-h-screen pb-10">
      <div className="sticky top-0 z-40 border-b border-[var(--waltube-text-3)] bg-[rgba(7,10,23,0.88)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 md:px-8">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 rounded-full border border-[#f5a623]/25 px-4 py-2 font-accent text-sm text-[#ffd27c] transition-colors hover:bg-[#f5a623]/10"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>
          <span className="font-accent text-xs uppercase tracking-[0.18em] text-[#f5c970]">
            Workflow thread
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
        <div className="relative pl-8">
          <div className="absolute bottom-0 left-3 top-0 w-px bg-gradient-to-b from-[#f5a623]/70 via-[#f5a623]/30 to-transparent" />

          <section className="relative mb-6 rounded-[var(--waltube-r-xl)] border border-[#f5a623]/30 bg-[linear-gradient(180deg,rgba(245,166,35,0.16),rgba(245,166,35,0.05))] p-4 shadow-[0_0_44px_rgba(245,166,35,0.08)]">
            <div className="absolute left-[-31px] top-10 h-4 w-4 rounded-full border-4 border-[#f5a623] bg-[var(--waltube-bg)] shadow-[0_0_18px_rgba(245,166,35,0.45)]" />

            <div className="mb-4 flex items-start justify-between gap-3">
              <h1 className="font-primary text-2xl font-semibold text-[var(--waltube-text-1)]">
                {workflow.title}
              </h1>
              <span className="rounded-full border border-[#f5a623]/30 bg-[#f5a623]/12 px-3 py-1 font-accent text-xs font-medium text-[#ffe1a6]">
                {workflow.stepCount} step workflow
              </span>
            </div>

            <div className="group relative mb-4 overflow-hidden rounded-[var(--waltube-r-lg)] transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(245,166,35,0.2)]" style={{ aspectRatio: mediaAspectRatio }}>
              {workflow.coverVideoUrl ? (
                <video
                  src={workflow.coverVideoUrl}
                  poster={workflow.coverThumbnailUrl}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  muted
                  playsInline
                  loop
                  autoPlay
                  controls
                />
              ) : (
                <img
                  src={workflow.coverThumbnailUrl}
                  alt={workflow.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-black/5" />
            </div>

            {isPremium && (
              <div className="mb-3 flex items-center gap-2 rounded-[var(--waltube-r-md)] border border-[#f5a623]/25 bg-[#f5a623]/8 px-3 py-2">
                <Lock className="h-3.5 w-3.5 text-[#ffd27c]" />
                <span className="font-accent text-xs text-[#ffe4b0]">
                  Premium &middot; {workflow.unlockPriceMist
                    ? `${formatMistAsSui(BigInt(workflow.unlockPriceMist))} SUI to unlock`
                    : 'Payment required'}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => void handleToggleSave()}
                disabled={authIsLoading}
                className={`flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--waltube-r-pill)] px-4 py-3 font-accent text-sm font-medium transition-all ${
                  saved
                    ? 'border border-[#f5a623]/35 bg-[#f5a623]/12 text-[#ffd27c]'
                    : 'glass-surface text-[var(--waltube-text-2)] hover:border-[#f5a623]/30 hover:text-[#ffd27c]'
                }`}
              >
                <Bookmark className={`h-4 w-4 ${saved ? 'fill-[#f5a623]' : ''}`} />
                <span>Save</span>
              </button>
              <button
                onClick={() => void handleToggleLike()}
                disabled={authIsLoading}
                className={`flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--waltube-r-pill)] px-4 py-3 font-accent text-sm font-medium transition-all ${
                  liked
                    ? 'border border-red-500/30 bg-red-500/10 text-red-300'
                    : 'glass-surface text-[var(--waltube-text-2)] hover:border-red-400/30 hover:text-red-300'
                }`}
              >
                <Heart className={`h-4 w-4 ${liked ? 'fill-red-400' : ''}`} />
                <span>{likesCount}</span>
              </button>
            </div>
          </section>

          {isPremium && !isCreator && !isUnlocked && decryptedSteps === null && (
            <section className="relative mb-6 rounded-[var(--waltube-r-xl)] border border-[#f5a623]/30 bg-[linear-gradient(180deg,rgba(245,166,35,0.12),rgba(245,166,35,0.04))] p-6 text-center">
              <div className="absolute left-[-31px] top-10 h-4 w-4 rounded-full border-4 border-[#f5a623] bg-[var(--waltube-bg)] shadow-[0_0_18px_rgba(245,166,35,0.45)]" />
              <Lock className="mx-auto mb-3 h-8 w-8 text-[#ffd27c]" />
              <h2 className="mb-2 font-primary text-lg font-semibold text-[var(--waltube-text-1)]">
                Premium Workflow
              </h2>
              <p className="mb-4 font-accent text-sm text-[var(--waltube-text-2)]">
                Unlock to reveal the step-by-step prompts and media.
              </p>
              <button
                onClick={() => {
                  if (!activeUser) {
                    navigate('/auth');
                    return;
                  }
                  void handleUnlock();
                }}
                disabled={isUnlocking || isCheckingUnlock || isDecrypting}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--waltube-r-pill)] bg-[#f5a623] px-6 py-3 font-accent text-sm font-medium text-[#1b1205] shadow-[0_0_24px_rgba(245,166,35,0.28)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {isUnlocking ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing payment...
                  </>
                ) : isDecrypting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Decrypting...
                  </>
                ) : (
                  <>
                    <Unlock className="h-4 w-4" />
                    Unlock for{' '}
                    {workflow.unlockPriceMist
                      ? `${formatMistAsSui(BigInt(workflow.unlockPriceMist))} SUI`
                      : 'SUI'}
                  </>
                )}
              </button>
              {unlockError && (
                <p className="mt-3 font-accent text-xs text-red-300">{unlockError}</p>
              )}
            </section>
          )}

          {isPremium && (isCreator || isUnlocked) && decryptedSteps === null && (
            <section className="relative mb-6 rounded-[var(--waltube-r-xl)] border border-[#f5a623]/30 bg-[linear-gradient(180deg,rgba(245,166,35,0.12),rgba(245,166,35,0.04))] p-6 text-center">
              <div className="absolute left-[-31px] top-10 h-4 w-4 rounded-full border-4 border-[#f5a623] bg-[var(--waltube-bg)] shadow-[0_0_18px_rgba(245,166,35,0.45)]" />
              {isDecrypting ? (
                <div className="flex items-center justify-center gap-2 font-accent text-sm text-[var(--waltube-text-2)]">
                  <Loader2 className="h-4 w-4 animate-spin text-[#ffd27c]" />
                  Decrypting premium content...
                </div>
              ) : (
                <>
                  <p className="mb-3 font-accent text-sm text-[var(--waltube-text-2)]">
                    {unlockError ?? 'You have access to this premium workflow.'}
                  </p>
                  <button
                    onClick={() => void runDecrypt()}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--waltube-r-pill)] bg-[#f5a623] px-6 py-3 font-accent text-sm font-medium text-[#1b1205] shadow-[0_0_24px_rgba(245,166,35,0.28)] transition-opacity hover:opacity-90"
                  >
                    <Unlock className="h-4 w-4" />
                    Reveal steps
                  </button>
                </>
              )}
            </section>
          )}

          {displaySteps.map((step) => {
            const stepModel = getAIModelConfig(step.model || workflow.tool);

            return (
              <section
                key={step.id}
                className="relative mb-6 rounded-[var(--waltube-r-xl)] border border-[var(--waltube-text-3)] bg-[rgba(15,18,33,0.86)] p-4 backdrop-blur-xl"
              >
              <div className="absolute left-[-31px] top-10 h-4 w-4 rounded-full border-4 border-[#f5a623]/70 bg-[var(--waltube-bg)]" />

              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#f5a623]/12 px-3 py-1 font-accent text-xs font-medium text-[#ffd27c]">
                  {step.stepNumber}
                </span>
                <span
                  className={`rounded-full border px-3 py-1 font-accent text-xs font-medium ${generationTypeAccent[step.generationType]}`}
                >
                  {generationTypeLabels[step.generationType]}
                </span>
                <span className="h-6 rounded-[var(--waltube-r-pill)] border border-white/20 bg-black/35 px-2.5 backdrop-blur-md flex items-center gap-1.5">
                  {stepModel.logoUrl ? (
                    <img
                      src={stepModel.logoUrl}
                      alt={stepModel.name}
                      className="h-4 w-auto"
                    />
                  ) : (
                    <span className={`font-accent text-[10px] font-bold ${stepModel.color}`}>
                      {stepModel.name}
                    </span>
                  )}
                </span>
              </div>

              <h2 className="font-primary text-xl font-semibold text-[var(--waltube-text-1)]">
                {step.label}
              </h2>

              <div className="mt-4 space-y-4">
                {step.generationType === 'image_to_video' && step.inputImageUrl && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="group overflow-hidden rounded-[var(--waltube-r-lg)] border border-[var(--waltube-text-3)] bg-black/20 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(245,166,35,0.16)]">
                      <div className="flex items-center gap-2 border-b border-[var(--waltube-text-3)] px-3 py-2 font-accent text-xs uppercase tracking-[0.12em] text-[var(--waltube-text-2)]">
                        <ImageIcon className="h-3.5 w-3.5" />
                        <span>Source image</span>
                      </div>
                      <div style={{ aspectRatio: mediaAspectRatio }}>
                        <img src={step.inputImageUrl} alt={step.label} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                      </div>
                    </div>
                  </div>
                )}

                {step.generationType === 'frames_to_video' && step.startFrameUrl && step.endFrameUrl && (
                  <div className="grid items-center gap-2 md:grid-cols-[1fr_auto_1fr]">
                    <div className="group overflow-hidden rounded-[var(--waltube-r-lg)] border border-[var(--waltube-text-3)] bg-black/20 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(245,166,35,0.16)]">
                      <div className="flex items-center gap-2 border-b border-[var(--waltube-text-3)] px-3 py-2 font-accent text-xs uppercase tracking-[0.12em] text-[var(--waltube-text-2)]">
                        <ImageIcon className="h-3.5 w-3.5" />
                        <span>Start</span>
                      </div>
                      <div style={{ aspectRatio: mediaAspectRatio }}>
                        <img src={step.startFrameUrl} alt={`${step.label} start`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                      </div>
                    </div>

                    <div className="flex items-center justify-center px-1">
                      <ArrowRight className="h-3.5 w-3.5 text-[var(--waltube-text-2)]" />
                    </div>

                    <div className="group overflow-hidden rounded-[var(--waltube-r-lg)] border border-[var(--waltube-text-3)] bg-black/20 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(245,166,35,0.16)]">
                      <div className="flex items-center gap-2 border-b border-[var(--waltube-text-3)] px-3 py-2 font-accent text-xs uppercase tracking-[0.12em] text-[var(--waltube-text-2)]">
                        <ImageIcon className="h-3.5 w-3.5" />
                        <span>End</span>
                      </div>
                      <div style={{ aspectRatio: mediaAspectRatio }}>
                        <img src={step.endFrameUrl} alt={`${step.label} end`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                      </div>
                    </div>
                  </div>
                )}

                {step.generationType === 'ingredients' &&
                  Array.isArray(step.ingredientsImageUrls) &&
                  step.ingredientsImageUrls.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 font-accent text-xs uppercase tracking-[0.12em] text-[var(--waltube-text-2)]">
                        <ImageIcon className="h-3.5 w-3.5" />
                        <span>Ingredients</span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                        {step.ingredientsImageUrls.map((imageUrl, ingredientIndex) => (
                          <div
                            key={`${step.id}-ingredient-${ingredientIndex}`}
                            className="group overflow-hidden rounded-[var(--waltube-r-lg)] border border-[var(--waltube-text-3)] bg-black/20 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(245,166,35,0.16)]"
                          >
                            <div style={{ aspectRatio: mediaAspectRatio }}>
                              <img
                                src={imageUrl}
                                alt={`${step.label} ingredient ${ingredientIndex + 1}`}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {step.promptText && (
                  <div className="rounded-[var(--waltube-r-lg)] border border-[var(--waltube-text-3)] bg-[var(--waltube-indigo)]/6 p-4">
                    <div className="mb-2 flex items-center gap-2 font-accent text-xs uppercase tracking-[0.14em] text-[var(--waltube-text-2)]">
                      <Wand2 className="h-3.5 w-3.5" />
                      <span>Prompt</span>
                    </div>
                    <p
                      className={`font-accent text-sm leading-6 text-[var(--waltube-text-1)] ${
                        expandedPrompts.has(step.id) ? '' : 'line-clamp-2'
                      }`}
                    >
                      {step.promptText}
                    </p>
                    {step.promptText.length > 120 && (
                      <button
                        onClick={() =>
                          setExpandedPrompts((prev) => {
                            const next = new Set(prev);
                            if (next.has(step.id)) {
                              next.delete(step.id);
                            } else {
                              next.add(step.id);
                            }
                            return next;
                          })
                        }
                        className="mt-2 font-accent text-xs text-[#ffd27c] hover:text-[#ffe8b8]"
                      >
                        {expandedPrompts.has(step.id) ? 'Show less' : 'Show more'}
                      </button>
                    )}
                  </div>
                )}

                <div className="group overflow-hidden rounded-[var(--waltube-r-lg)] border border-[var(--waltube-text-3)] bg-black/20 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(245,166,35,0.16)]">
                  <div className="flex items-center gap-2 border-b border-[var(--waltube-text-3)] px-3 py-2 font-accent text-xs uppercase tracking-[0.12em] text-[var(--waltube-text-2)]">
                    {step.resultContentType === 'video' ? <Play className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                    <span>Result</span>
                  </div>
                  <div style={{ aspectRatio: mediaAspectRatio }}>
                    {step.resultContentType === 'video' ? (
                      <video
                        src={step.resultMediaUrl}
                        poster={step.resultThumbnailUrl}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        controls
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <img
                        src={step.resultThumbnailUrl}
                        alt={`${step.label} result`}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    )}
                  </div>
                </div>

                {step.note && (
                  <div className="rounded-[var(--waltube-r-lg)] border border-[#f5a623]/20 bg-[#f5a623]/8 p-4">
                    <p className="font-accent text-sm leading-6 text-[#ffe4b0]">{step.note}</p>
                  </div>
                )}

                {step.promptText && (
                  <button
                    onClick={() => {
                      void copyText(step.promptText ?? '');
                      setCopiedStepId(step.id);
                      window.setTimeout(() => setCopiedStepId((current) => (current === step.id ? null : current)), 1800);
                    }}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--waltube-r-pill)] bg-[var(--waltube-indigo)] px-4 py-3 font-accent text-sm font-medium text-white transition-opacity hover:opacity-90"
                  >
                    <Copy className="h-4 w-4" />
                    <span>{copiedStepId === step.id ? 'Copied' : 'Copy prompt'}</span>
                  </button>
                )}
              </div>
              </section>
            );
          })}

          {hasAccess && displaySteps.length > 0 && (
            <button
              onClick={() => {
                const promptLines = displaySteps
                  .filter((step) => step.promptText)
                  .map((step, index) => `${index + 1}. ${step.promptText}`)
                  .join('\n\n');
                if (!promptLines) {
                  return;
                }
                void copyText(promptLines);
              }}
              className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-[var(--waltube-r-pill)] border border-[#f5a623]/30 bg-[#f5a623]/10 px-5 py-3 font-accent text-sm font-medium text-[#ffe4b0] transition-colors hover:bg-[#f5a623]/18"
            >
              <Copy className="h-4 w-4" />
              <span>Copy all prompts</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

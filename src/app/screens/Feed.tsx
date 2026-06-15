import { useEffect, useState } from 'react';
import { Bell, Settings, Image, Video, Filter, ChevronDown, Check } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useSuiClient } from '@mysten/dapp-kit';
import { useEnokiFlow } from '@mysten/enoki/react';
import { PromptCard } from '../components/PromptCard';
import { WorkflowCard } from '../components/WorkflowCard';
import { ForkPromptModal } from '../components/ForkPromptModal';
import { SkeletonFeedGrid } from '../components/SkeletonCard';
import { Avatar } from '../components/Avatar';
import { followsApi, metaApi, notificationsApi, paymentsApi, promptsApi, uploadsApi, workflowsApi } from '../../lib/backend';
import { useAuth } from '../../lib/auth-context';
import { createVideoThumbnailFile, detectImageFileDimensions, detectVideoFileDimensions } from '../../lib/media';
import { useBackendQuery } from '../../lib/useBackendQuery';
import { Prompt, Workflow } from '../../lib/types';
import { truncateText } from '../../lib/text';
import {
  isAttributionConfigured,
  recordForkAttributionOnchain,
  recordPromptAttributionOnchain,
} from '../../lib/attribution';
import {
  createRoyaltyConfigOnchain,
  isForkRoyaltiesEnabled,
  sendRoyaltyPayment,
} from '../../lib/royalties';
import {
  isSuiAddress,
  isSuiPaidLikesEnabled,
  paidLikeAmountMist,
  sendSuiPayment,
} from '../../lib/sui-payments';

export function Feed() {
  const navigate = useNavigate();
  const suiClient = useSuiClient();
  const enokiFlow = useEnokiFlow();
  const { user: activeUser, isLoading: authIsLoading } = useAuth();
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(new Set());
  const [contentType, setContentType] = useState<'all' | 'image' | 'video'>('all');
  const [followedUsers, setFollowedUsers] = useState<Set<string>>(new Set());
  const [likedPrompts, setLikedPrompts] = useState<Set<string>>(new Set());
  const [savedPrompts, setSavedPrompts] = useState<Set<string>>(new Set());
  const [copiedPrompts, setCopiedPrompts] = useState<Set<string>>(new Set());
  const [countedCopiedPrompts, setCountedCopiedPrompts] = useState<Set<string>>(new Set());
  const [forkModalPrompt, setForkModalPrompt] = useState<Prompt | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [promptOverrides, setPromptOverrides] = useState<Record<string, Prompt>>({});
  const [localCreatedPrompts, setLocalCreatedPrompts] = useState<Prompt[]>([]);
  const [workflowOverrides, setWorkflowOverrides] = useState<Record<string, Workflow>>({});
  const [likedWorkflows, setLikedWorkflows] = useState<Set<string>>(new Set());
  const [savedWorkflows, setSavedWorkflows] = useState<Set<string>>(new Set());

  const { data: prompts, isLoading: promptsLoading } = useBackendQuery(() => promptsApi.getFeedPrompts(), [], []);
  const { data: workflows, isLoading: workflowsLoading } = useBackendQuery(() => workflowsApi.getFeedWorkflows(), [], []);
  const isFeedLoading = promptsLoading || workflowsLoading;
  const { data: availableModels } = useBackendQuery(() => metaApi.getAvailableModels(), [], []);
  const { data: availableStyleTags } = useBackendQuery(() => metaApi.getAvailableStyleTags(), [], []);
  const { data: likedPromptIds } = useBackendQuery(
    () => (activeUser ? promptsApi.getLikedPromptIds(activeUser.uid) : Promise.resolve([])),
    [],
    [activeUser?.uid],
  );
  const { data: savedPromptIds } = useBackendQuery(
    () => (activeUser ? promptsApi.getSavedPromptIds(activeUser.uid) : Promise.resolve([])),
    [],
    [activeUser?.uid],
  );
  const { data: copiedPromptIds } = useBackendQuery(
    () => (activeUser ? promptsApi.getCopiedPromptIds(activeUser.uid) : Promise.resolve([])),
    [],
    [activeUser?.uid],
  );
  const { data: followingUserIds } = useBackendQuery(
    () => (activeUser ? followsApi.getFollowingUserIds(activeUser.uid) : Promise.resolve([])),
    [],
    [activeUser?.uid],
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
  const { data: notifications } = useBackendQuery(
    () => (activeUser ? notificationsApi.getNotificationsForUser(activeUser.uid) : Promise.resolve([])),
    [],
    [activeUser?.uid],
  );
  const hasUnreadNotifications = notifications.some((entry) => !entry.read);

  const hydratedPrompts = (() => {
    const merged = [...localCreatedPrompts, ...prompts.map((prompt) => promptOverrides[prompt.id] ?? prompt)];
    const uniqueById = new Map<string, Prompt>();
    for (const prompt of merged) {
      if (!uniqueById.has(prompt.id)) {
        uniqueById.set(prompt.id, prompt);
      }
    }
    return Array.from(uniqueById.values());
  })();
  const hydratedWorkflows = workflows.map((workflow) => workflowOverrides[workflow.id] ?? workflow);

  const filters = ['All', 'Workflow', ...availableModels, ...availableStyleTags.slice(0, 4)];

  const isFilterSelected = (filter: string) =>
    filter === 'All' ? selectedFilters.size === 0 : selectedFilters.has(filter);

  const toggleFilter = (filter: string) => {
    if (filter === 'All') {
      setSelectedFilters(new Set());
      return;
    }

    setSelectedFilters((prev) => {
      const next = new Set(prev);
      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }
      return next;
    });
  };

  const selectedFilterCount = selectedFilters.size;
  const selectedFilterLabel =
    selectedFilterCount === 0
      ? 'All'
      : selectedFilterCount === 1
        ? Array.from(selectedFilters)[0]
        : `${selectedFilterCount} filters`;
  const displayNavHandle = activeUser ? truncateText(activeUser.handle, 14) : null;

  const getAuthedUser = () => {
    if (authIsLoading) {
      return null;
    }

    if (!activeUser) {
      navigate('/auth');
      return null;
    }

    return activeUser;
  };

  const hasWorkflowFilter = selectedFilters.has('Workflow');
  const activeNonWorkflowFilters = Array.from(selectedFilters).filter(
    (entry) => entry !== 'Workflow',
  );

  useEffect(() => {
    setLikedPrompts(new Set(likedPromptIds));
  }, [likedPromptIds]);

  useEffect(() => {
    setSavedPrompts(new Set(savedPromptIds));
  }, [savedPromptIds]);

  useEffect(() => {
    setCountedCopiedPrompts(new Set(copiedPromptIds));
  }, [copiedPromptIds]);

  useEffect(() => {
    setFollowedUsers(new Set(followingUserIds));
  }, [followingUserIds]);

  useEffect(() => {
    setLikedWorkflows(new Set(likedWorkflowIds));
  }, [likedWorkflowIds]);

  useEffect(() => {
    setSavedWorkflows(new Set(savedWorkflowIds));
  }, [savedWorkflowIds]);

  const handleFollow = (authorUid: string) => {
    const viewer = getAuthedUser();
    if (!viewer) {
      return;
    }

    if (authorUid === viewer.uid) {
      return;
    }

    const wasFollowing = followedUsers.has(authorUid);
    setFollowedUsers((prev) => {
      const next = new Set(prev);
      if (wasFollowing) {
        next.delete(authorUid);
      } else {
        next.add(authorUid);
      }
      return next;
    });

    void followsApi.toggleFollow(viewer.uid, authorUid).then((result) => {
      setFollowedUsers((prev) => {
        const next = new Set(prev);
        if (result.following) {
          next.add(authorUid);
        } else {
          next.delete(authorUid);
        }
        return next;
      });
    }).catch((error) => {
      setFollowedUsers((prev) => {
        const next = new Set(prev);
        if (wasFollowing) {
          next.add(authorUid);
        } else {
          next.delete(authorUid);
        }
        return next;
      });
      window.alert(error instanceof Error ? error.message : 'Could not update follow status.');
    });
  };

  const handleLike = async (promptId: string) => {
    const viewer = getAuthedUser();
    if (!viewer) {
      return;
    }

    const targetPrompt = hydratedPrompts.find((entry) => entry.id === promptId);
    if (!targetPrompt) {
      return;
    }

    const wasLiked = likedPrompts.has(promptId);
    const shouldPayCreator =
      isSuiPaidLikesEnabled
      && !wasLiked
      && targetPrompt.authorUid !== viewer.uid
      && isSuiAddress(targetPrompt.authorUid);

    // 1. Optimistic UI update — instant, no loading
    setLikedPrompts((prev) => {
      const newSet = new Set(prev);
      if (wasLiked) {
        newSet.delete(promptId);
      } else {
        newSet.add(promptId);
      }
      return newSet;
    });

    setPromptOverrides((prev) => ({
      ...prev,
      [promptId]: {
        ...(prev[promptId] ?? targetPrompt),
        likes: Math.max(0, targetPrompt.likes + (wasLiked ? -1 : 1)),
      },
    }));

    // 2. Background payment + backend sync
    const runPayment = async () => {
      if (!shouldPayCreator) return true;

      try {
        const hasRoyaltyConfig = isForkRoyaltiesEnabled && targetPrompt.royaltyConfigId;
        console.log('[like] paid like firing', { promptId, hasRoyaltyConfig, recipient: targetPrompt.authorUid });

        const payment = hasRoyaltyConfig
          ? await sendRoyaltyPayment(
              {
                royaltyConfigId: targetPrompt.royaltyConfigId!,
                amountMist: paidLikeAmountMist,
              },
              enokiFlow,
              suiClient,
            )
          : await sendSuiPayment(
              {
                recipient: targetPrompt.authorUid,
                amountMist: paidLikeAmountMist,
              },
              enokiFlow,
              suiClient,
            );

        await paymentsApi.recordPaidLike({
          promptId,
          payerUid: viewer.uid,
          creatorUid: targetPrompt.authorUid,
          amountMist: payment.amountMist,
          amountSui: payment.amountSui,
          txDigest: payment.txDigest,
          network: payment.network,
        });
        console.log('[like] paid like tx ok:', payment.txDigest);
        return true;
      } catch (error) {
        console.error('[like] paid like failed — like will revert:', error);
        return false;
      }
    };

    const paymentOk = await runPayment();

    if (!paymentOk) {
      // Rollback — payment failed, silently remove the like
      setLikedPrompts((prev) => {
        const newSet = new Set(prev);
        newSet.delete(promptId);
        return newSet;
      });
      setPromptOverrides((prev) => ({
        ...prev,
        [promptId]: targetPrompt,
      }));
      return;
    }

    // 3. Sync like state with backend
    void promptsApi
      .toggleLike(promptId, viewer.uid)
      .then((result) => {
        setLikedPrompts((prev) => {
          const newSet = new Set(prev);
          if (result.liked) {
            newSet.add(promptId);
          } else {
            newSet.delete(promptId);
          }
          return newSet;
        });

        setPromptOverrides((prev) => ({
          ...prev,
          [promptId]: {
            ...(prev[promptId] ?? targetPrompt),
            likes: result.likes,
          },
        }));
      })
      .catch((error) => {
        console.error('[like] toggleLike failed — like will revert:', error);
        setLikedPrompts((prev) => {
          const newSet = new Set(prev);
          if (wasLiked) {
            newSet.add(promptId);
          } else {
            newSet.delete(promptId);
          }
          return newSet;
        });

        setPromptOverrides((prev) => ({
          ...prev,
          [promptId]: targetPrompt,
        }));
      });
  };

  const handleSave = (promptId: string) => {
    const viewer = getAuthedUser();
    if (!viewer) {
      return;
    }

    const targetPrompt = hydratedPrompts.find((entry) => entry.id === promptId);
    if (!targetPrompt) {
      return;
    }

    const wasSaved = savedPrompts.has(promptId);

    setSavedPrompts((prev) => {
      const next = new Set(prev);
      if (wasSaved) {
        next.delete(promptId);
      } else {
        next.add(promptId);
      }
      return next;
    });

    setPromptOverrides((prev) => ({
      ...prev,
      [promptId]: {
        ...targetPrompt,
        saves: Math.max(0, targetPrompt.saves + (wasSaved ? -1 : 1)),
      },
    }));

    void promptsApi
      .toggleSave(promptId, viewer.uid)
      .then((result) => {
        setSavedPrompts((prev) => {
          const next = new Set(prev);
          if (result.saved) {
            next.add(promptId);
          } else {
            next.delete(promptId);
          }
          return next;
        });

        setPromptOverrides((prev) => ({
          ...prev,
          [promptId]: {
            ...(prev[promptId] ?? targetPrompt),
            saves: result.saves,
          },
        }));
      })
      .catch(() => {
        setSavedPrompts((prev) => {
          const next = new Set(prev);
          if (wasSaved) {
            next.add(promptId);
          } else {
            next.delete(promptId);
          }
          return next;
        });

        setPromptOverrides((prev) => ({
          ...prev,
          [promptId]: targetPrompt,
        }));
      });
  };

  const handleFork = (promptId: string) => {
    const prompt = hydratedPrompts.find((entry) => entry.id === promptId);
    if (prompt) {
      setForkModalPrompt(prompt);
    }
  };

  const handleCopy = (promptId: string) => {
    setCopiedPrompts((prev) => {
      const newSet = new Set(prev);
      newSet.add(promptId);
      return newSet;
    });

    setTimeout(() => {
      setCopiedPrompts((prev) => {
        const newSet = new Set(prev);
        newSet.delete(promptId);
        return newSet;
      });
    }, 2000);

    if (authIsLoading || !activeUser || countedCopiedPrompts.has(promptId)) {
      return;
    }

    const targetPrompt = hydratedPrompts.find((entry) => entry.id === promptId);
    if (!targetPrompt) {
      return;
    }

    setCountedCopiedPrompts((prev) => {
      const next = new Set(prev);
      next.add(promptId);
      return next;
    });
    setPromptOverrides((prev) => ({
      ...prev,
      [promptId]: {
        ...targetPrompt,
        copies: targetPrompt.copies + 1,
      },
    }));

    void promptsApi
      .recordCopy(promptId, activeUser.uid)
      .then((result) => {
        setCountedCopiedPrompts((prev) => {
          const next = new Set(prev);
          next.add(promptId);
          return next;
        });
        setPromptOverrides((prev) => ({
          ...prev,
          [promptId]: {
            ...(prev[promptId] ?? targetPrompt),
            copies: result.copies,
          },
        }));
      })
      .catch(() => {
        setCountedCopiedPrompts((prev) => {
          const next = new Set(prev);
          next.delete(promptId);
          return next;
        });
        setPromptOverrides((prev) => ({
          ...prev,
          [promptId]: targetPrompt,
        }));
      });
  };

  const handleWorkflowLike = (workflowId: string) => {
    const viewer = getAuthedUser();
    if (!viewer) {
      return;
    }

    const targetWorkflow = hydratedWorkflows.find((entry) => entry.id === workflowId);
    if (!targetWorkflow) {
      return;
    }

    const wasLiked = likedWorkflows.has(workflowId);

    setLikedWorkflows((prev) => {
      const next = new Set(prev);
      if (wasLiked) {
        next.delete(workflowId);
      } else {
        next.add(workflowId);
      }
      return next;
    });

    setWorkflowOverrides((prev) => ({
      ...prev,
      [workflowId]: {
        ...targetWorkflow,
        likes: Math.max(0, targetWorkflow.likes + (wasLiked ? -1 : 1)),
      },
    }));

    void workflowsApi
      .toggleLike(workflowId, viewer.uid)
      .then((result) => {
        setLikedWorkflows((prev) => {
          const next = new Set(prev);
          if (result.liked) {
            next.add(workflowId);
          } else {
            next.delete(workflowId);
          }
          return next;
        });

        setWorkflowOverrides((prev) => ({
          ...prev,
          [workflowId]: {
            ...(prev[workflowId] ?? targetWorkflow),
            likes: result.likes,
          },
        }));
      })
      .catch(() => {
        setLikedWorkflows((prev) => {
          const next = new Set(prev);
          if (wasLiked) {
            next.add(workflowId);
          } else {
            next.delete(workflowId);
          }
          return next;
        });

        setWorkflowOverrides((prev) => ({
          ...prev,
          [workflowId]: targetWorkflow,
        }));
      });
  };

  const handleWorkflowSave = (workflowId: string) => {
    const viewer = getAuthedUser();
    if (!viewer) {
      return;
    }

    const targetWorkflow = hydratedWorkflows.find((entry) => entry.id === workflowId);
    if (!targetWorkflow) {
      return;
    }

    const wasSaved = savedWorkflows.has(workflowId);

    setSavedWorkflows((prev) => {
      const next = new Set(prev);
      if (wasSaved) {
        next.delete(workflowId);
      } else {
        next.add(workflowId);
      }
      return next;
    });

    setWorkflowOverrides((prev) => ({
      ...prev,
      [workflowId]: {
        ...targetWorkflow,
        saves: Math.max(0, targetWorkflow.saves + (wasSaved ? -1 : 1)),
      },
    }));

    void workflowsApi
      .toggleSave(workflowId, viewer.uid)
      .then((result) => {
        setSavedWorkflows((prev) => {
          const next = new Set(prev);
          if (result.saved) {
            next.add(workflowId);
          } else {
            next.delete(workflowId);
          }
          return next;
        });

        setWorkflowOverrides((prev) => ({
          ...prev,
          [workflowId]: {
            ...(prev[workflowId] ?? targetWorkflow),
            saves: result.saves,
          },
        }));
      })
      .catch(() => {
        setSavedWorkflows((prev) => {
          const next = new Set(prev);
          if (wasSaved) {
            next.add(workflowId);
          } else {
            next.delete(workflowId);
          }
          return next;
        });

        setWorkflowOverrides((prev) => ({
          ...prev,
          [workflowId]: targetWorkflow,
        }));
      });
  };

  const filteredPrompts = hydratedPrompts.filter((prompt) => {
    if (hasWorkflowFilter) {
      return false;
    }

    if (contentType !== 'all' && prompt.contentType !== contentType) {
      return false;
    }

    if (activeNonWorkflowFilters.length === 0) {
      return true;
    }

    return activeNonWorkflowFilters.some(
      (filter) => prompt.model === filter || prompt.styleTags.includes(filter.toLowerCase()),
    );
  });

  const filteredWorkflows = hydratedWorkflows.filter((workflow) => {
    if (contentType !== 'all') {
      return false;
    }

    if (activeNonWorkflowFilters.length === 0) {
      return true;
    }

    return activeNonWorkflowFilters.some(
      (filter) =>
        workflow.tool === filter ||
        workflow.tags.includes(filter.toLowerCase()),
    );
  });

  const feedItems: Array<
    | { id: string; kind: 'prompt'; createdAt: Date; prompt: Prompt }
    | { id: string; kind: 'workflow'; createdAt: Date; workflow: Workflow }
  > = [
    ...filteredPrompts.map((prompt) => ({
      id: `prompt-${prompt.id}`,
      kind: 'prompt' as const,
      createdAt: prompt.createdAt,
      prompt,
    })),
    ...filteredWorkflows.map((workflow) => ({
      id: `workflow-${workflow.id}`,
      kind: 'workflow' as const,
      createdAt: workflow.createdAt,
      workflow,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-40 glass-nav border-b border-[var(--waltube-text-3)] md:hidden" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center justify-between px-3 sm:px-4 py-3 sm:py-4">
          <span className="font-primary font-bold text-lg sm:text-xl text-[var(--waltube-blue)]">WalTube</span>
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => navigate('/notifications')}
              className="relative p-2 sm:p-2.5 rounded-full hover:bg-[var(--waltube-surface)] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--waltube-text-1)]" />
              {hasUnreadNotifications && (
                <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--waltube-blue)] blue-glow" />
              )}
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="p-2 sm:p-2.5 rounded-full hover:bg-[var(--waltube-surface)] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--waltube-text-1)]" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-hide px-3 sm:px-4 pb-3 sm:pb-4">
          <div className="flex gap-2">
            {filters.map((filter) => (
              <button
                key={filter}
                onClick={() => toggleFilter(filter)}
                className={`px-3 sm:px-4 py-2 rounded-[var(--waltube-r-pill)] font-accent text-xs sm:text-sm whitespace-nowrap transition-all ${
                  isFilterSelected(filter)
                    ? 'bg-[var(--waltube-indigo)] text-white indigo-glow'
                    : 'glass-surface text-[var(--waltube-text-2)] hover:text-[var(--waltube-text-1)]'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-1.5 sm:gap-2 px-3 sm:px-4 pb-3 border-b border-[var(--waltube-text-3)]">
          <button
            onClick={() => setContentType('all')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 sm:py-2.5 rounded-[var(--waltube-r-pill)] font-accent text-xs sm:text-sm font-medium transition-all ${
              contentType === 'all'
                ? 'bg-[var(--waltube-blue)] text-white blue-glow'
                : 'glass-surface text-[var(--waltube-text-2)]'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setContentType('video')}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-2.5 rounded-[var(--waltube-r-pill)] font-accent text-xs sm:text-sm font-medium transition-all ${
              contentType === 'video'
                ? 'bg-[var(--waltube-blue)] text-white blue-glow'
                : 'glass-surface text-[var(--waltube-text-2)]'
            }`}
          >
            <Video className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden xs:inline">Videos</span>
          </button>
          <button
            onClick={() => setContentType('image')}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-2.5 rounded-[var(--waltube-r-pill)] font-accent text-xs sm:text-sm font-medium transition-all ${
              contentType === 'image'
                ? 'bg-[var(--waltube-blue)] text-white blue-glow'
                : 'glass-surface text-[var(--waltube-text-2)]'
            }`}
          >
            <Image className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden xs:inline">Images</span>
          </button>
        </div>
      </div>

      <div className="hidden md:block sticky top-0 z-40 glass-nav border-b border-[var(--waltube-text-3)]">
        <div className="px-8 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="relative">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-5 py-2 rounded-[var(--waltube-r-pill)] glass-surface text-[var(--waltube-text-1)] hover:text-white transition-all"
              >
                <Filter className="w-4 h-4" />
                <span className="font-accent text-sm font-medium">{selectedFilterLabel}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>

              {showFilters && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-[var(--waltube-bg)] rounded-[var(--waltube-r-lg)] border border-[var(--waltube-text-3)] shadow-xl z-50">
                  <button
                    onClick={() => setSelectedFilters(new Set())}
                    className="w-full text-left px-4 py-2.5 font-accent text-xs text-[var(--waltube-blue)] hover:bg-[var(--waltube-surface)] border-b border-[var(--waltube-text-3)]"
                  >
                    Clear all
                  </button>
                  {filters.map((filter) => (
                    <button
                      key={filter}
                      onClick={() => toggleFilter(filter)}
                      className={`w-full text-left px-4 py-2.5 font-accent text-sm transition-all last:rounded-b-[var(--waltube-r-lg)] flex items-center justify-between ${
                        isFilterSelected(filter)
                          ? 'bg-[var(--waltube-indigo)] text-white'
                          : 'text-[var(--waltube-text-2)] hover:text-white hover:bg-[var(--waltube-surface)]'
                      }`}
                    >
                      <span>{filter}</span>
                      {isFilterSelected(filter) && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setContentType('all')}
                className={`px-5 py-2 rounded-[var(--waltube-r-pill)] font-accent text-sm font-medium transition-all ${
                  contentType === 'all'
                    ? 'bg-[var(--waltube-blue)] text-white blue-glow'
                    : 'glass-surface text-[var(--waltube-text-2)] hover:text-[var(--waltube-text-1)]'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setContentType('video')}
                className={`group relative p-2 rounded-[var(--waltube-r-pill)] font-accent text-sm font-medium transition-all ${
                  contentType === 'video'
                    ? 'bg-[var(--waltube-blue)] text-white blue-glow'
                    : 'glass-surface text-[var(--waltube-text-2)] hover:text-[var(--waltube-text-1)]'
                }`}
              >
                <Video className="w-4 h-4" />
                <span className="absolute left-1/2 -translate-x-1/2 -bottom-8 px-2 py-1 rounded-md bg-[var(--waltube-bg)] border border-[var(--waltube-text-3)] text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  Videos
                </span>
              </button>
              <button
                onClick={() => setContentType('image')}
                className={`group relative p-2 rounded-[var(--waltube-r-pill)] font-accent text-sm font-medium transition-all ${
                  contentType === 'image'
                    ? 'bg-[var(--waltube-blue)] text-white blue-glow'
                    : 'glass-surface text-[var(--waltube-text-2)] hover:text-[var(--waltube-text-1)]'
                }`}
              >
                <Image className="w-4 h-4" />
                <span className="absolute left-1/2 -translate-x-1/2 -bottom-8 px-2 py-1 rounded-md bg-[var(--waltube-bg)] border border-[var(--waltube-text-3)] text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  Images
                </span>
              </button>
            </div>

            <button
              onClick={() => {
                if (authIsLoading) {
                  return;
                }
                navigate(activeUser ? '/profile' : '/auth');
              }}
              disabled={authIsLoading}
              className="max-w-[180px] truncate px-6 py-2 rounded-[var(--waltube-r-pill)] bg-[var(--waltube-indigo)] text-white font-accent text-sm font-medium indigo-glow hover:opacity-90 transition-all"
              title={authIsLoading ? 'Loading account' : activeUser ? `@${activeUser.handle}` : 'Login'}
            >
              {authIsLoading ? 'Loading...' : displayNavHandle ? `@${displayNavHandle}` : 'Login'}
            </button>
          </div>
        </div>
      </div>

      <div className="px-3 sm:px-4 md:px-8 py-3 sm:py-4 md:py-6">
        {isFeedLoading ? (
          <SkeletonFeedGrid promptCount={4} workflowCount={2} />
        ) : (
          <div className="prompt-grid">
            {feedItems.map((item) =>
            item.kind === 'prompt' ? (
              <PromptCard
                key={item.id}
                prompt={item.prompt}
                onFollow={handleFollow}
                isFollowing={followedUsers.has(item.prompt.authorUid)}
                showFollowButton={!(activeUser && item.prompt.authorUid === activeUser.uid)}
                onLike={handleLike}
                isLiked={likedPrompts.has(item.prompt.id)}
                onSave={handleSave}
                isSaved={savedPrompts.has(item.prompt.id)}
                onFork={handleFork}
                isForked={false}
                onCopy={handleCopy}
                isCopied={copiedPrompts.has(item.prompt.id)}
              />
            ) : (
              <WorkflowCard
                key={item.id}
                workflow={item.workflow}
                onLike={handleWorkflowLike}
                isLiked={likedWorkflows.has(item.workflow.id)}
                onSave={handleWorkflowSave}
                isSaved={savedWorkflows.has(item.workflow.id)}
              />
            ),
          )}
          </div>
        )}
      </div>

      {forkModalPrompt && (
        <ForkPromptModal
          prompt={forkModalPrompt}
          onClose={() => setForkModalPrompt(null)}
          onSave={async ({ forkedPrompt, mediaFile }) => {
            const viewer = getAuthedUser();
            if (!viewer) {
              return;
            }

            let uploadedVideoUrl: string | undefined;
            let uploadedThumbnailUrl: string | undefined;
            let mediaWidth: number | undefined;
            let mediaHeight: number | undefined;
            let aspectRatio: 'portrait' | 'landscape' | undefined;
            let contentBlobId: string | undefined;
            let metadataBlobId: string | undefined;

            if (mediaFile) {
              if (forkModalPrompt.contentType === 'video') {
                if (!mediaFile.type.startsWith('video/')) {
                  throw new Error('This fork requires a video file.');
                }

                const dimensions = await detectVideoFileDimensions(mediaFile);
                mediaWidth = dimensions.width;
                mediaHeight = dimensions.height;
                aspectRatio = dimensions.height > dimensions.width ? 'portrait' : 'landscape';

                const uploadedVideo = await uploadsApi.uploadPromptMedia(mediaFile, viewer.uid);
                const thumbnailFile = await createVideoThumbnailFile(mediaFile);
                const uploadedThumbnail = await uploadsApi.uploadPromptMedia(thumbnailFile, viewer.uid);
                uploadedVideoUrl = uploadedVideo.downloadUrl;
                uploadedThumbnailUrl = uploadedThumbnail.downloadUrl;
                contentBlobId = uploadedVideo.blobId;
                metadataBlobId = uploadedThumbnail.blobId;
              } else {
                if (!mediaFile.type.startsWith('image/')) {
                  throw new Error('This fork requires an image file.');
                }

                const dimensions = await detectImageFileDimensions(mediaFile);
                mediaWidth = dimensions.width;
                mediaHeight = dimensions.height;
                aspectRatio = dimensions.height > dimensions.width ? 'portrait' : 'landscape';

                const uploadedImage = await uploadsApi.uploadPromptMedia(mediaFile, viewer.uid);
                uploadedVideoUrl = '';
                uploadedThumbnailUrl = uploadedImage.downloadUrl;
                contentBlobId = uploadedImage.blobId;
                metadataBlobId = uploadedImage.blobId;
              }
            } else {
              contentBlobId = forkModalPrompt.walrusContentBlobId;
              metadataBlobId = forkModalPrompt.walrusMetadataBlobId;
            }

            let createdFork = await promptsApi.forkPrompt({
              sourcePromptId: forkModalPrompt.id,
              authorUid: viewer.uid,
              promptText: forkedPrompt.promptText ?? forkModalPrompt.promptText,
              model: forkedPrompt.model ?? forkModalPrompt.model,
              styleTags: forkedPrompt.styleTags ?? forkModalPrompt.styleTags,
              moodLabel: forkedPrompt.moodLabel ?? forkModalPrompt.moodLabel,
              videoUrl: uploadedVideoUrl,
              thumbnailUrl: uploadedThumbnailUrl,
              mediaWidth,
              mediaHeight,
              aspectRatio,
              walrusContentBlobId: contentBlobId,
              walrusMetadataBlobId: metadataBlobId,
            });

            if (isAttributionConfigured && contentBlobId) {
              try {
                let attribution: { txDigest: string; attributionObjectId: string | null };

                if (forkModalPrompt.onchainAttributionId) {
                  // Normal case: parent was attributed onchain, create fork record
                  console.log('[attribution] recording fork with parent:', forkModalPrompt.onchainAttributionId);
                  attribution = await recordForkAttributionOnchain(
                    {
                      parentAttributionObjectId: forkModalPrompt.onchainAttributionId,
                      promptId: createdFork.id,
                      contentBlobId,
                      metadataBlobId,
                    },
                    enokiFlow,
                    suiClient,
                  );
                } else {
                  // Fallback: parent was never attributed, create a fresh prompt record
                  console.warn('[attribution] parent lacks onchainAttributionId; creating standalone prompt attribution for fork');
                  attribution = await recordPromptAttributionOnchain(
                    {
                      promptId: createdFork.id,
                      contentBlobId,
                      metadataBlobId,
                    },
                    enokiFlow,
                    suiClient,
                  );
                }

                await promptsApi.updateOnchainAttribution(createdFork.id, viewer.uid, {
                  onchainAttributionId: attribution.attributionObjectId,
                  onchainAttributionTxDigest: attribution.txDigest,
                  walrusContentBlobId: contentBlobId,
                  walrusMetadataBlobId: metadataBlobId,
                });

                createdFork = {
                  ...createdFork,
                  onchainAttributionId: attribution.attributionObjectId ?? undefined,
                  onchainAttributionTxDigest: attribution.txDigest,
                  walrusContentBlobId: contentBlobId,
                  walrusMetadataBlobId: metadataBlobId,
                };
                console.log('[attribution] fork attributed onchain. tx:', attribution.txDigest, 'object:', attribution.attributionObjectId);

                // ─── Create royalty config for this fork ──────────────────
                console.log('[royalties] gate check', {
                  isForkRoyaltiesEnabled,
                  parentAuthorUid: forkModalPrompt.authorUid,
                  parentIsSuiAddress: isSuiAddress(forkModalPrompt.authorUid),
                  viewerUid: viewer.uid,
                  viewerIsSuiAddress: isSuiAddress(viewer.uid),
                });
                if (isForkRoyaltiesEnabled && isSuiAddress(forkModalPrompt.authorUid) && isSuiAddress(viewer.uid)) {
                  try {
                    console.log('[royalties] calling create_royalty_config with', {
                      promptId: createdFork.id,
                      recipients: [
                        { address: forkModalPrompt.authorUid, shareBps: 500 },
                        { address: viewer.uid, shareBps: 9500 },
                      ],
                    });
                    const royaltyResult = await createRoyaltyConfigOnchain(
                      {
                        promptId: createdFork.id,
                        recipients: [
                          { address: forkModalPrompt.authorUid, shareBps: 500 },
                          { address: viewer.uid, shareBps: 9500 },
                        ],
                      },
                      enokiFlow,
                      suiClient,
                    );
                    console.log('[royalties] config created onchain. tx:', royaltyResult.txDigest, 'configId:', royaltyResult.royaltyConfigId);

                    if (royaltyResult.royaltyConfigId) {
                      await promptsApi.updateOnchainAttribution(createdFork.id, viewer.uid, {
                        royaltyConfigId: royaltyResult.royaltyConfigId,
                        royaltyConfigTxDigest: royaltyResult.txDigest,
                      });
                      createdFork = {
                        ...createdFork,
                        royaltyConfigId: royaltyResult.royaltyConfigId,
                        royaltyConfigTxDigest: royaltyResult.txDigest,
                      };
                      console.log('[royalties] persisted royaltyConfigId to Firestore for fork:', createdFork.id);
                    } else {
                      console.warn('[royalties] tx ok but royaltyConfigId is null — could not parse RoyaltyConfig object from tx result. tx:', royaltyResult.txDigest);
                    }
                  } catch (royaltyError) {
                    console.error('[royalties] could not create config:', royaltyError);
                    if (royaltyError instanceof Error) {
                      console.error('[royalties] error.message:', royaltyError.message);
                      console.error('[royalties] error.stack:', royaltyError.stack);
                    }
                  }
                } else {
                  console.warn('[royalties] skipped — gate failed. See gate check log above.');
                }
              } catch (error) {
                console.warn('Could not record fork attribution onchain:', error);
                if (import.meta.env.DEV) {
                  createdFork = {
                    ...createdFork,
                    onchainAttributionTxDigest: '0xdevtx1234567890abcdef1234567890abcdef1234567890abcdef',
                  };
                  console.log('[dev] set fake onchainAttributionTxDigest for fork');
                }
              }
            } else {
              console.log('[attribution] skipped fork attribution — config:', isAttributionConfigured, 'blobId:', contentBlobId);
            }

            setLocalCreatedPrompts((prev) => [createdFork, ...prev.filter((entry) => entry.id !== createdFork.id)]);
            setPromptOverrides((prev) => ({
              ...prev,
              [forkModalPrompt.id]: {
                ...forkModalPrompt,
                forks: forkModalPrompt.forks + 1,
              },
            }));
          }}
        />
      )}
    </div>
  );
}

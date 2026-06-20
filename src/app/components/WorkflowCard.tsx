import { useEffect, useRef, useState } from 'react';
import { Bookmark, Check, ChevronDown, Crown, Heart, Lock, Play, Share2, Sparkles } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router';
import { Workflow } from '../../lib/types';
import { truncateText } from '../../lib/text';
import { formatMistAsSui } from '../../lib/sui-payments';
import { Avatar } from './Avatar';

interface WorkflowCardProps {
  workflow: Workflow;
  onLike?: (id: string) => void;
  onSave?: (id: string) => void;
  isLiked?: boolean;
  isSaved?: boolean;
}

export function WorkflowCard({
  workflow,
  onLike,
  onSave,
  isLiked = false,
  isSaved = false,
}: WorkflowCardProps) {
  const navigate = useNavigate();
  const [isHovering, setIsHovering] = useState(false);
  const [hasShared, setHasShared] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const shareTimeoutRef = useRef<number | null>(null);
  const displayAuthorHandle = truncateText(workflow.authorHandle, 18);
  const displayTitle = truncateText(workflow.title, 56);
  const coverAspectRatio = workflow.mediaAspectRatio === 'portrait' ? '9 / 12' : '16 / 10';
  const isPremium = Boolean(workflow.isPremium);
  const unlockPriceLabel = workflow.unlockPriceMist
    ? `${formatMistAsSui(BigInt(workflow.unlockPriceMist))} SUI`
    : null;

  useEffect(() => {
    return () => {
      if (shareTimeoutRef.current !== null) {
        window.clearTimeout(shareTimeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnter = () => {
    if (!workflow.coverVideoUrl) {
      return;
    }
    setIsHovering(true);
    if (videoRef.current) {
      videoRef.current.play().catch(() => {
        // Ignore autoplay failures for muted preview videos.
      });
    }
  };

  const handleMouseLeave = () => {
    if (!workflow.coverVideoUrl) {
      return;
    }
    setIsHovering(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  const copyShareUrl = async (shareUrl: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      return true;
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      try {
        document.execCommand('copy');
        return true;
      } catch {
        return false;
      } finally {
        textArea.remove();
      }
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/workflow/${workflow.id}`;
    const shareData = {
      title: workflow.title,
      text: `Check out this workflow by @${workflow.authorHandle}`,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        const copied = await copyShareUrl(shareUrl);
        if (!copied) {
          return;
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      const copied = await copyShareUrl(shareUrl);
      if (!copied) {
        return;
      }
    }

    setHasShared(true);
    if (shareTimeoutRef.current !== null) {
      window.clearTimeout(shareTimeoutRef.current);
    }
    shareTimeoutRef.current = window.setTimeout(() => {
      setHasShared(false);
    }, 1800);
  };

  return (
    <div
      className={`prompt-masonry-item rounded-[var(--waltube-r-lg)] p-4 cursor-pointer ${
        isPremium
          ? 'border border-[#f5a623]/45 bg-[linear-gradient(165deg,rgba(245,166,35,0.16),rgba(245,166,35,0.04)_55%,rgba(15,18,33,0.9))] shadow-[0_0_38px_rgba(245,166,35,0.16)]'
          : 'glass-card card-top-edge'
      }`}
    >
      {isPremium && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-[var(--waltube-r-pill)] border border-[#f5a623]/35 bg-[#f5a623]/12 px-3 py-1.5">
          <span className="inline-flex items-center gap-1.5 font-accent text-xs font-semibold uppercase tracking-[0.14em] text-[#ffd27c]">
            <Crown className="h-3.5 w-3.5 fill-[#f5a623] text-[#f5a623]" />
            Premium
          </span>
          {unlockPriceLabel && (
            <span className="font-accent text-xs font-medium text-[#ffe4b0]">{unlockPriceLabel}</span>
          )}
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar
            src={workflow.authorAvatar}
            alt={workflow.authorHandle}
            size={34}
            className={isPremium ? 'border-2 border-[#f5a623]' : 'border-2 border-[var(--waltube-blue)]'}
          />
          <div className="min-w-0">
            <button
              onClick={() => navigate(`/user/${workflow.authorHandle}`)}
              className="max-w-[132px] truncate font-primary font-medium text-[var(--waltube-text-1)] transition-colors hover:text-[var(--waltube-indigo)]"
              title={`@${workflow.authorHandle}`}
            >
              @{displayAuthorHandle}
            </button>
            <div className="flex items-center gap-2">
              <span className="font-accent text-xs text-[var(--waltube-text-2)]">
                {formatDistanceToNow(workflow.createdAt, { addSuffix: true })}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-full border border-amber-500/30 bg-black/20 px-3 py-1.5 font-accent text-xs font-medium text-amber-400">
          {workflow.stepCount}
        </div>
      </div>

      <button
        onClick={() => navigate(`/workflow/${workflow.id}`)}
        className="group relative mb-4 block w-full overflow-hidden rounded-[var(--waltube-r-lg)] text-left transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(245,158,11,0.18)]"
        style={{ aspectRatio: coverAspectRatio }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {workflow.coverVideoUrl ? (
          <video
            ref={videoRef}
            src={workflow.coverVideoUrl}
            poster={workflow.coverThumbnailUrl}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            muted
            playsInline
            loop
            style={{ opacity: isHovering ? 1 : 0 }}
          />
        ) : (
          <img
            src={workflow.coverThumbnailUrl}
            alt={workflow.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        )}
        {workflow.coverVideoUrl && (
          <img
            src={workflow.coverThumbnailUrl}
            alt={workflow.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            style={{ opacity: isHovering ? 0 : 1 }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />
        {isPremium && (
          <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-[#f5a623]/40 bg-black/55 px-2.5 py-1 font-accent text-[11px] font-semibold text-[#ffd27c] backdrop-blur-sm">
            <Lock className="h-3 w-3" />
            <span>Locked</span>
          </div>
        )}
        {workflow.coverVideoUrl && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors pointer-events-none"
            style={{ opacity: isHovering ? 0 : 1 }}
          >
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-full border-4 bg-black/30 backdrop-blur-sm transition-transform duration-200 group-hover:scale-105 ${
                isPremium
                  ? 'border-[#f5a623] shadow-[0_0_28px_rgba(245,166,35,0.45)]'
                  : 'border-amber-400 shadow-[0_0_28px_rgba(245,158,11,0.35)]'
              }`}
            >
              {isPremium ? (
                <Lock className="h-6 w-6 text-[#f5a623]" />
              ) : (
                <Play className="ml-1 h-6 w-6 fill-amber-400 text-amber-400" />
              )}
            </div>
          </div>
        )}
      </button>

      <h3 className="mb-3 font-primary text-xl font-semibold text-[var(--waltube-text-1)]" title={workflow.title}>
        {displayTitle}
      </h3>

      <div className="mb-4 flex flex-wrap gap-2">
        {workflow.tags.map((tag) => (
          <span
            key={`${workflow.id}-${tag}`}
            className="rounded-full bg-amber-500/10 px-3 py-1 font-accent text-sm text-amber-400"
          >
            #{tag}
          </span>
        ))}
      </div>

      {isPremium ? (
        <>
          <button
            onClick={() => navigate(`/workflow/${workflow.id}`)}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[var(--waltube-r-pill)] bg-[#f5a623] px-4 py-3 font-accent text-sm font-semibold text-[#1b1205] shadow-[0_0_24px_rgba(245,166,35,0.32)] transition-opacity hover:opacity-90"
          >
            <Sparkles className="h-4 w-4" />
            <span>{unlockPriceLabel ? `Unlock for ${unlockPriceLabel}` : 'Unlock workflow'}</span>
          </button>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => onSave?.(workflow.id)}
              className={`flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--waltube-r-pill)] px-4 py-3 font-accent text-sm font-medium transition-all ${
                isSaved
                  ? 'border border-amber-500/40 bg-amber-500/12 text-amber-400'
                  : 'glass-surface text-[var(--waltube-text-2)] hover:border-amber-500/30 hover:text-amber-400'
              }`}
            >
              <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-amber-400' : ''}`} />
              <span>Save</span>
            </button>

            <button
              onClick={() => void handleShare()}
              className={`flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--waltube-r-pill)] px-4 py-3 font-accent text-sm font-medium transition-all ${
                hasShared
                  ? 'border border-[#4cce8a]/45 bg-[#4cce8a]/14 text-[#9ef5c6]'
                  : 'glass-surface text-[var(--waltube-text-2)] hover:border-[#4cce8a]/35 hover:text-[#9ef5c6]'
              }`}
              aria-label="Share workflow"
            >
              {hasShared ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              <span>{hasShared ? 'Shared' : 'Share'}</span>
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => onLike?.(workflow.id)}
              className={`flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--waltube-r-pill)] px-4 py-3 font-accent text-sm font-medium transition-all ${
                isLiked
                  ? 'border border-red-500/30 bg-red-500/10 text-red-400'
                  : 'glass-surface text-[var(--waltube-text-2)] hover:border-red-400/30 hover:text-red-300'
              }`}
            >
              <Heart className={`h-4 w-4 ${isLiked ? 'fill-red-400' : ''}`} />
              <span>{workflow.likes}</span>
            </button>

            <button
              onClick={() => onSave?.(workflow.id)}
              className={`flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--waltube-r-pill)] px-4 py-3 font-accent text-sm font-medium transition-all ${
                isSaved
                  ? 'border border-amber-500/40 bg-amber-500/12 text-amber-400'
                  : 'glass-surface text-[var(--waltube-text-2)] hover:border-amber-500/30 hover:text-amber-400'
              }`}
            >
              <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-amber-400' : ''}`} />
              <span>Save</span>
            </button>

            <button
              onClick={() => void handleShare()}
              className={`flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--waltube-r-pill)] px-4 py-3 font-accent text-sm font-medium transition-all ${
                hasShared
                  ? 'border border-[#4cce8a]/45 bg-[#4cce8a]/14 text-[#9ef5c6]'
                  : 'glass-surface text-[var(--waltube-text-2)] hover:border-[#4cce8a]/35 hover:text-[#9ef5c6]'
              }`}
              aria-label="Share workflow"
            >
              {hasShared ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              <span>{hasShared ? 'Shared' : 'Share'}</span>
            </button>
          </div>

          <button
            onClick={() => navigate(`/workflow/${workflow.id}`)}
            className="group mt-4 flex w-full items-center justify-center rounded-[var(--waltube-r-pill)] border border-amber-500/20 bg-black/10 py-2 text-amber-400 transition-all duration-200 hover:border-amber-500/40 hover:bg-amber-500/10"
            aria-label="Open workflow thread"
          >
            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-hover:translate-y-0.5" />
          </button>
        </>
      )}
    </div>
  );
}

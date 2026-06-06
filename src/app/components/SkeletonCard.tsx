export function SkeletonPromptCard() {
  return (
    <div className="prompt-masonry-item glass-card rounded-[var(--waltube-r-lg)] p-4 card-top-edge">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="h-[34px] w-[34px] rounded-full skeleton-shimmer" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-24 skeleton-shimmer" />
            <div className="h-2.5 w-14 skeleton-shimmer" />
          </div>
        </div>
        <div className="h-7 w-16 rounded-full skeleton-shimmer" />
      </div>

      {/* Media */}
      <div className="mb-3 w-full rounded-[var(--waltube-r-md)] aspect-video skeleton-shimmer" />

      {/* Prompt text */}
      <div className="space-y-1.5 mb-3">
        <div className="h-3 w-full skeleton-shimmer" />
        <div className="h-3 w-5/6 skeleton-shimmer" />
        <div className="h-3 w-4/6 skeleton-shimmer" />
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="h-6 w-14 rounded-full skeleton-shimmer" />
        <div className="h-6 w-20 rounded-full skeleton-shimmer" />
        <div className="h-6 w-12 rounded-full skeleton-shimmer" />
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-4 gap-2">
        <div className="h-10 rounded-[var(--waltube-r-pill)] skeleton-shimmer" />
        <div className="h-10 rounded-[var(--waltube-r-pill)] skeleton-shimmer" />
        <div className="h-10 rounded-[var(--waltube-r-pill)] skeleton-shimmer" />
        <div className="h-10 rounded-[var(--waltube-r-pill)] skeleton-shimmer" />
      </div>
    </div>
  );
}

export function SkeletonWorkflowCard() {
  return (
    <div className="prompt-masonry-item glass-card rounded-[var(--waltube-r-lg)] p-4 card-top-edge">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="h-[34px] w-[34px] rounded-full skeleton-shimmer" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-24 skeleton-shimmer" />
            <div className="h-2.5 w-14 skeleton-shimmer" />
          </div>
        </div>
        <div className="h-7 w-16 rounded-full skeleton-shimmer" />
      </div>

      {/* Cover */}
      <div className="mb-4 w-full rounded-[var(--waltube-r-md)] aspect-[16/10] skeleton-shimmer" />

      {/* Title */}
      <div className="h-5 w-3/4 skeleton-shimmer mb-3" />

      {/* Tags */}
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="h-6 w-14 rounded-full skeleton-shimmer" />
        <div className="h-6 w-20 rounded-full skeleton-shimmer" />
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-3 gap-2">
        <div className="h-10 rounded-[var(--waltube-r-pill)] skeleton-shimmer" />
        <div className="h-10 rounded-[var(--waltube-r-pill)] skeleton-shimmer" />
        <div className="h-10 rounded-[var(--waltube-r-pill)] skeleton-shimmer" />
      </div>
    </div>
  );
}

interface SkeletonFeedGridProps {
  promptCount?: number;
  workflowCount?: number;
}

export function SkeletonFeedGrid({ promptCount = 4, workflowCount = 2 }: SkeletonFeedGridProps) {
  return (
    <div className="prompt-grid">
      {Array.from({ length: promptCount }).map((_, i) => (
        <SkeletonPromptCard key={`skeleton-prompt-${i}`} />
      ))}
      {Array.from({ length: workflowCount }).map((_, i) => (
        <SkeletonWorkflowCard key={`skeleton-workflow-${i}`} />
      ))}
    </div>
  );
}

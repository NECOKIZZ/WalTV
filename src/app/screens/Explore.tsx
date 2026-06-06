import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router';
import { followsApi, promptsApi, usersApi } from '../../lib/backend';
import { useAuth } from '../../lib/auth-context';
import { useBackendQuery } from '../../lib/useBackendQuery';
import { truncateText } from '../../lib/text';
import { Avatar } from '../components/Avatar';

export function Explore() {
  const navigate = useNavigate();
  const { user: activeUser, isLoading: authIsLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [followedUsers, setFollowedUsers] = useState<Set<string>>(new Set());
  const { data: users, isLoading: usersLoading } = useBackendQuery(() => usersApi.getAllUsers(), [], []);
  const { data: prompts, isLoading: promptsLoading } = useBackendQuery(() => promptsApi.getFeedPrompts(), [], []);
  const isExploreLoading = usersLoading || promptsLoading;
  const { data: followingUserIds } = useBackendQuery(
    () => (activeUser ? followsApi.getFollowingUserIds(activeUser.uid) : Promise.resolve([])),
    [],
    [activeUser?.uid],
  );

  useEffect(() => {
    setFollowedUsers(new Set(followingUserIds));
  }, [followingUserIds]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const trendingTags = useMemo(() => {
    const counts = new Map<string, { tag: string; count: number }>();
    for (const prompt of prompts) {
      for (const styleTag of prompt.styleTags) {
        const key = styleTag.toLowerCase();
        const current = counts.get(key);
        if (current) {
          current.count += 1;
        } else {
          counts.set(key, { tag: styleTag, count: 1 });
        }
      }
    }

    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .filter((entry) => !normalizedQuery || entry.tag.toLowerCase().includes(normalizedQuery));
  }, [normalizedQuery, prompts]);

  const topCreators = useMemo(() => {
    const promptCountsByUser = new Map<string, number>();
    const copyCountsByUser = new Map<string, number>();

    for (const prompt of prompts) {
      promptCountsByUser.set(prompt.authorUid, (promptCountsByUser.get(prompt.authorUid) ?? 0) + 1);
      copyCountsByUser.set(prompt.authorUid, (copyCountsByUser.get(prompt.authorUid) ?? 0) + prompt.copies);
    }

    const ranked = users
      .map((user) => ({
        ...user,
        promptCount: promptCountsByUser.get(user.uid) ?? 0,
        copyCount: copyCountsByUser.get(user.uid) ?? 0,
      }))
      .filter((user) => user.promptCount > 0 || user.copyCount > 0)
      .sort((a, b) => {
        if (b.copyCount !== a.copyCount) {
          return b.copyCount - a.copyCount;
        }
        if (b.promptCount !== a.promptCount) {
          return b.promptCount - a.promptCount;
        }
        return b.followers - a.followers;
      })
      .map((user, index) => ({
        ...user,
        rank: index + 1,
      }));

    if (!normalizedQuery) {
      return ranked;
    }

    return ranked.filter(
      (user) =>
        user.displayName.toLowerCase().includes(normalizedQuery) ||
        user.handle.toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery, prompts, users]);

  const trendingPrompts = useMemo(() => {
    const ranked = [...prompts].sort((a, b) => {
      if (b.copies !== a.copies) {
        return b.copies - a.copies;
      }
      if (b.likes !== a.likes) {
        return b.likes - a.likes;
      }
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    if (!normalizedQuery) {
      return ranked.slice(0, 12);
    }

    return ranked.filter((prompt) => {
      const haystack = [
        prompt.promptText,
        prompt.authorHandle,
        prompt.model,
        prompt.moodLabel,
        ...prompt.styleTags,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, prompts]);

  const handleToggleFollow = (targetUid: string) => {
    if (authIsLoading) {
      return;
    }

    if (!activeUser) {
      navigate('/auth');
      return;
    }

    if (targetUid === activeUser.uid) {
      return;
    }

    const wasFollowing = followedUsers.has(targetUid);
    setFollowedUsers((prev) => {
      const next = new Set(prev);
      if (wasFollowing) {
        next.delete(targetUid);
      } else {
        next.add(targetUid);
      }
      return next;
    });

    void followsApi.toggleFollow(activeUser.uid, targetUid).then((result) => {
      setFollowedUsers((prev) => {
        const next = new Set(prev);
        if (result.following) {
          next.add(targetUid);
        } else {
          next.delete(targetUid);
        }
        return next;
      });
    }).catch((error) => {
      setFollowedUsers((prev) => {
        const next = new Set(prev);
        if (wasFollowing) {
          next.add(targetUid);
        } else {
          next.delete(targetUid);
        }
        return next;
      });
      window.alert(error instanceof Error ? error.message : 'Could not update follow status.');
    });
  };

  return (
    <div className="min-h-screen pb-8">
      <div className="sticky top-0 z-40 glass-nav border-b border-[var(--waltube-text-3)]">
        <div className="px-4 md:px-8 py-4 md:py-6">
          <h1 className="font-primary font-semibold text-lg md:text-2xl text-[var(--waltube-text-1)] mb-4">
            Explore
          </h1>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--waltube-text-2)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search prompts, creators, models..."
              className="w-full pl-12 pr-4 py-3 rounded-[var(--waltube-r-pill)] glass-surface border border-[var(--waltube-text-3)] focus:border-[var(--waltube-indigo)] focus:indigo-glow outline-none font-accent text-sm text-[var(--waltube-text-1)] placeholder:text-[var(--waltube-text-2)] transition-all"
            />
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-8">
        {/* Trending Tags */}
        <div>
          <h2 className="font-primary font-semibold text-base md:text-xl text-[var(--waltube-text-1)] mb-4">
            Trending Tags
          </h2>
          {isExploreLoading ? (
            <div className="flex gap-3">
              <div className="h-12 w-28 rounded-[var(--waltube-r-pill)] skeleton-shimmer" />
              <div className="h-12 w-36 rounded-[var(--waltube-r-pill)] skeleton-shimmer" />
              <div className="h-12 w-24 rounded-[var(--waltube-r-pill)] skeleton-shimmer" />
              <div className="h-12 w-32 rounded-[var(--waltube-r-pill)] skeleton-shimmer" />
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
              <div className="flex gap-3">
                {trendingTags.length > 0 ? (
                  trendingTags.map(({ tag, count }) => (
                    <button
                      key={tag}
                      onClick={() => setSearchQuery(tag)}
                      className="flex flex-col items-center gap-1 px-6 py-3 rounded-[var(--waltube-r-pill)] glass-surface hover:bg-[var(--waltube-indigo)]/10 transition-colors whitespace-nowrap"
                    >
                      <span className="font-accent font-medium text-sm text-[var(--waltube-indigo)]">
                        #{tag}
                      </span>
                      <span className="font-accent text-xs text-[var(--waltube-text-2)]">
                        {count.toLocaleString()} prompts
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="font-accent text-sm text-[var(--waltube-text-2)] px-1 py-2">
                    No trending tags yet.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Top Creators */}
        <div>
          <h2 className="font-primary font-semibold text-base md:text-xl text-[var(--waltube-text-1)] mb-4">
            Top Creators
          </h2>
          {isExploreLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="h-20 rounded-[var(--waltube-r-lg)] skeleton-shimmer" />
              <div className="h-20 rounded-[var(--waltube-r-lg)] skeleton-shimmer" />
              <div className="h-20 rounded-[var(--waltube-r-lg)] skeleton-shimmer" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {topCreators.length > 0 ? (
                topCreators.map((creator) => {
                  const displayName = truncateText(creator.displayName, 24);
                  const displayHandle = truncateText(creator.handle, 18);
                  const isSelf = activeUser?.uid === creator.uid;
                  const isFollowing = followedUsers.has(creator.uid);

                  return (
                    <div
                      key={creator.uid}
                      onClick={() => navigate(`/user/${creator.handle}`)}
                      className="flex items-center gap-4 p-4 rounded-[var(--waltube-r-lg)] glass-surface card-top-edge hover:bg-[var(--waltube-surface)] transition-colors cursor-pointer"
                    >
                      <div className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--waltube-indigo)]/20 font-accent font-semibold text-sm text-[var(--waltube-indigo)]">
                        #{creator.rank}
                      </div>
                      <Avatar
                        src={creator.avatarUrl}
                        alt={creator.handle}
                        size={48}
                        className="border-2 border-[var(--waltube-indigo)]"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-primary font-medium text-[var(--waltube-text-1)] truncate" title={creator.displayName}>
                          {displayName}
                        </p>
                        <p className="font-accent text-sm text-[var(--waltube-text-2)] truncate" title={`@${creator.handle}`}>
                          @{displayHandle}
                        </p>
                        <p className="font-accent text-xs text-[var(--waltube-indigo)] mt-1">
                          {creator.copyCount.toLocaleString()} unique copies
                        </p>
                      </div>
                      {isSelf ? (
                        <span className="px-4 py-2 rounded-[var(--waltube-r-pill)] glass-surface font-accent text-sm text-[var(--waltube-text-2)]">
                          You
                        </span>
                      ) : (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handleToggleFollow(creator.uid);
                          }}
                          disabled={authIsLoading}
                          className={`px-4 py-2 rounded-[var(--waltube-r-pill)] font-accent text-sm font-medium transition-opacity ${
                            isFollowing
                              ? 'glass-surface text-[var(--waltube-indigo)] border border-[var(--waltube-indigo)]/40'
                              : 'bg-[var(--waltube-indigo)] text-white indigo-glow'
                          }`}
                        >
                          {isFollowing ? 'Following' : 'Follow'}
                        </button>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="col-span-1 md:col-span-2 lg:col-span-3 py-6">
                  <p className="font-accent text-sm text-[var(--waltube-text-2)]">No creators to show yet.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Trending Prompts */}
        <div>
          <h2 className="font-primary font-semibold text-base md:text-xl text-[var(--waltube-text-1)] mb-4">
            Trending Prompts
          </h2>
          {isExploreLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="h-32 rounded-[var(--waltube-r-lg)] skeleton-shimmer" />
              <div className="h-32 rounded-[var(--waltube-r-lg)] skeleton-shimmer" />
              <div className="h-32 rounded-[var(--waltube-r-lg)] skeleton-shimmer" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {trendingPrompts.length > 0 ? (
                trendingPrompts.map((prompt) => (
                  <div
                    key={prompt.id}
                    onClick={() => navigate(`/prompt/${prompt.id}`)}
                    className="p-4 rounded-[var(--waltube-r-lg)] glass-surface card-top-edge hover:bg-[var(--waltube-surface)] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-3 py-1 rounded-[var(--waltube-r-pill)] bg-[var(--waltube-blue)]/10 font-accent text-xs text-[var(--waltube-blue)]">
                        {prompt.model}
                      </span>
                      <span className="font-accent text-xs text-[var(--waltube-indigo)]">
                        {prompt.copies.toLocaleString()} copies
                      </span>
                    </div>
                    <p className="font-accent text-sm text-[var(--waltube-text-2)] line-clamp-2 mb-2">
                      {prompt.promptText}
                    </p>
                    <p className="font-accent text-xs text-[var(--waltube-text-2)]">
                      by @{truncateText(prompt.authorHandle, 18)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="col-span-1 md:col-span-2 lg:col-span-3 py-6">
                  <p className="font-accent text-sm text-[var(--waltube-text-2)]">No prompts to show yet.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

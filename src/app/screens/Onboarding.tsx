import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check } from 'lucide-react';
import { authApi, followsApi, metaApi, usersApi } from '../../lib/backend';
import { useBackendQuery } from '../../lib/useBackendQuery';
import { useAuth } from '../../lib/auth-context';
import { truncateText } from '../../lib/text';
import { Avatar } from '../components/Avatar';

type Step = 1 | 2 | 3;

export function Onboarding() {
  const navigate = useNavigate();
  const { user: activeUser } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [followedCreators, setFollowedCreators] = useState<string[]>([]);
  const { data: availableModels } = useBackendQuery(() => metaApi.getAvailableModels(), [], []);
  const { data: users } = useBackendQuery(() => usersApi.getAllUsers(), [], []);
  const { data: followingUserIds } = useBackendQuery(
    () => (activeUser ? followsApi.getFollowingUserIds(activeUser.uid) : Promise.resolve([])),
    [],
    [activeUser?.uid],
  );

  useEffect(() => {
    setFollowedCreators(followingUserIds);
  }, [followingUserIds]);

  const suggestedCreators = users.filter((user) => user.uid !== activeUser?.uid);

  const toggleModel = (model: string) => {
    setSelectedModels((previous) =>
      previous.includes(model) ? previous.filter((entry) => entry !== model) : [...previous, model],
    );
  };

  const toggleFollow = (uid: string) => {
    if (!activeUser) {
      navigate('/auth');
      return;
    }

    const wasFollowing = followedCreators.includes(uid);
    setFollowedCreators((previous) =>
      wasFollowing ? previous.filter((entry) => entry !== uid) : [...previous, uid],
    );

    void followsApi.toggleFollow(activeUser.uid, uid).then((result) => {
      setFollowedCreators((previous) => {
        const next = new Set(previous);
        if (result.following) {
          next.add(uid);
        } else {
          next.delete(uid);
        }
        return Array.from(next);
      });
    }).catch(() => {
      setFollowedCreators((previous) => {
        const next = new Set(previous);
        if (wasFollowing) {
          next.add(uid);
        } else {
          next.delete(uid);
        }
        return Array.from(next);
      });
    });
  };

  const followAll = () => {
    if (!activeUser) {
      navigate('/auth');
      return;
    }

    const creatorIds = suggestedCreators.map((creator) => creator.uid);
    setFollowedCreators(creatorIds);
    for (const creatorId of creatorIds) {
      if (!followingUserIds.includes(creatorId)) {
        void followsApi.toggleFollow(activeUser.uid, creatorId).catch(() => undefined);
      }
    }
  };

  const handleContinue = async () => {
    if (step < 3) {
      setStep((step + 1) as Step);
      return;
    }

    if (activeUser) {
      try {
        await authApi.updateProfile({
          uid: activeUser.uid,
          handle: activeUser.handle,
          bio: activeUser.bio,
          avatarUrl: activeUser.avatarUrl,
          links: activeUser.links,
          primaryModels: selectedModels.length > 0 ? selectedModels : activeUser.primaryModels,
          hasOnboarded: true,
        });
      } catch (error) {
        console.error('Could not save onboarding progress:', error);
      }
    }

    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="ambient-glow" />

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 relative z-10">
        <div className="flex gap-2 mb-12">
          {[1, 2, 3].map((index) => (
            <div
              key={index}
              className={`w-2 h-2 rounded-full transition-all ${
                index === step
                  ? 'w-8 bg-[var(--waltube-indigo)] indigo-glow'
                  : index < step
                  ? 'bg-[var(--waltube-indigo)]/50'
                  : 'bg-[var(--waltube-text-3)]'
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="max-w-md w-full text-center space-y-6">
            <div className="mb-8">
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className="font-primary font-bold text-4xl text-white">Wal</span>
                <span className="font-primary font-bold text-4xl text-[var(--waltube-indigo)]">
                  Tube
                </span>
              </div>
              <p className="font-accent text-lg text-[var(--waltube-text-1)] mb-2">
                curate your prompts. rate the results.
              </p>
              <p className="font-accent text-sm text-[var(--waltube-text-2)]">
                The home for AI video prompts.
              </p>
            </div>

            <button
              onClick={handleContinue}
              className="w-full py-4 rounded-[var(--waltube-r-pill)] bg-gradient-to-r from-[#5500cc] to-[var(--waltube-blue)] text-white font-accent font-medium text-lg indigo-glow hover:opacity-90 transition-opacity"
            >
              Get Started
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="max-w-md w-full space-y-6">
            <div className="text-center mb-8">
              <h2 className="font-primary font-bold text-2xl text-[var(--waltube-text-1)] mb-2">
                Which AI video tools do you use?
              </h2>
              <p className="font-accent text-sm text-[var(--waltube-text-2)]">
                Select all that apply
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {availableModels.map((model) => (
                <button
                  key={model}
                  onClick={() => toggleModel(model)}
                  className={`relative p-6 rounded-[var(--waltube-r-xl)] text-center transition-all ${
                    selectedModels.includes(model)
                      ? 'glass-surface border-2 border-[var(--waltube-indigo)] indigo-glow'
                      : 'glass-surface border border-[var(--waltube-text-3)] hover:border-[var(--waltube-indigo)]/30'
                  }`}
                >
                  <div className="font-primary font-semibold text-lg text-[var(--waltube-text-1)] mb-1">
                    {model}
                  </div>
                  <div className="font-accent text-xs text-[var(--waltube-text-2)]">
                    AI Video
                  </div>
                  {selectedModels.includes(model) && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[var(--waltube-indigo)] flex items-center justify-center indigo-glow">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>

            <button
              onClick={handleContinue}
              disabled={selectedModels.length === 0}
              className="w-full py-4 rounded-[var(--waltube-r-pill)] bg-gradient-to-r from-[#5500cc] to-[var(--waltube-blue)] text-white font-accent font-medium text-lg indigo-glow hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="max-w-md w-full space-y-6">
            <div className="text-center mb-8">
              <h2 className="font-primary font-bold text-2xl text-[var(--waltube-text-1)] mb-2">
                Follow some top creators
              </h2>
              <p className="font-accent text-sm text-[var(--waltube-text-2)]">
                to seed your feed
              </p>
            </div>

            <button
              onClick={followAll}
              className="w-full py-3 rounded-[var(--waltube-r-pill)] glass-surface border border-[var(--waltube-indigo)] font-accent font-medium text-[var(--waltube-indigo)] hover:bg-[var(--waltube-indigo)]/10 transition-colors"
            >
              Follow All
            </button>

	            <div className="space-y-3">
	              {suggestedCreators.map((creator) => {
                  const displayName = truncateText(creator.displayName, 24);
                  const displayHandle = truncateText(creator.handle, 18);

                  return (
                    <div
                      key={creator.uid}
                      className="flex items-center gap-4 p-4 rounded-[var(--waltube-r-lg)] glass-surface card-top-edge"
                    >
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
                        <p className="font-accent text-xs text-[var(--waltube-text-2)] mt-1">
                          {creator.primaryModels.join(', ')}
                        </p>
                      </div>
                      <button
                        onClick={() => toggleFollow(creator.uid)}
                        className={`px-5 py-2 rounded-[var(--waltube-r-pill)] font-accent text-sm font-medium transition-all ${
                          followedCreators.includes(creator.uid)
                            ? 'bg-[var(--waltube-indigo)] text-white indigo-glow'
                            : 'glass-surface text-[var(--waltube-text-1)]'
                        }`}
                      >
                        {followedCreators.includes(creator.uid) ? 'Following' : 'Follow'}
                      </button>
                    </div>
                  );
                })}
	            </div>

            <button
              onClick={handleContinue}
              className="w-full py-4 rounded-[var(--waltube-r-pill)] bg-gradient-to-r from-[#5500cc] to-[var(--waltube-blue)] text-white font-accent font-medium text-lg indigo-glow hover:opacity-90 transition-opacity"
            >
              Start Exploring
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

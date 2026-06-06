import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';

export function Auth() {
  const navigate = useNavigate();
  const { user, signInWithGoogle, isLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      navigate(user.hasOnboarded ? '/' : '/onboarding');
    }
  }, [navigate, user]);

  const handleSignIn = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      // Triggers a full-page redirect to Google. The promise resolves with
      // the OAuth URL but the page unloads before the resolution matters.
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden">
      <div className="ambient-glow" />
      <div className="w-full max-w-md relative z-10">
        <div className="glass-surface border border-[var(--waltube-text-3)] rounded-[var(--waltube-r-xl)] p-8 card-top-edge">
          <div className="mb-8 text-center">
            <p className="font-primary font-bold text-3xl text-white">
              Wal<span className="text-[var(--waltube-indigo)]">Tube</span>
            </p>
            <h1 className="mt-5 font-primary font-bold text-2xl text-[var(--waltube-text-1)]">
              Welcome to WalTube
            </h1>
            <p className="mt-2 font-accent text-sm text-[var(--waltube-text-2)]">
              Sign in with Google. A Sui wallet is created for you automatically &mdash; no seed phrase, no extension.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-[var(--waltube-r-md)] border border-red-500/30 bg-red-500/10 px-4 py-3 font-accent text-sm text-red-200">
              {error}
            </div>
          )}

          <button
            onClick={() => void handleSignIn()}
            disabled={isSubmitting || isLoading}
            className="w-full rounded-[var(--waltube-r-pill)] border border-[var(--waltube-text-3)] bg-white px-4 py-3 font-accent text-sm font-medium text-[#202124] hover:bg-[#f6f7f8] disabled:opacity-60 transition-opacity"
          >
            {isSubmitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Redirecting to Google...
              </span>
            ) : (
              'Continue with Google'
            )}
          </button>

          <p className="mt-6 text-center font-accent text-xs text-[var(--waltube-text-2)]">
            Powered by zkLogin on Sui &middot; your wallet is yours, secured by your Google account.
          </p>
        </div>
      </div>
    </div>
  );
}

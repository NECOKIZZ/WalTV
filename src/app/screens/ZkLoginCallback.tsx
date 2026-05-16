import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Loader2 } from 'lucide-react';
import { useEnokiFlow } from '@mysten/enoki/react';
import { authApi } from '../../lib/backend';

// Google redirects users here after they approve zkLogin. We hand the URL
// fragment to Enoki which extracts the JWT, fetches the salt + ZK proof,
// and populates the local session (sessionStorage). Then we look up or
// create the user's Firestore record and route to the appropriate next
// screen.
export function ZkLoginCallback() {
  const navigate = useNavigate();
  const enokiFlow = useEnokiFlow();
  const [status, setStatus] = useState<string>('Finishing sign-in...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        // The JWT lives in the URL fragment (after #). Enoki's helper reads
        // it from window.location.hash by default; passing it explicitly is
        // belt-and-braces for environments that strip fragments.
        await enokiFlow.handleAuthCallback(window.location.hash);

        const session = await enokiFlow.getSession();
        const address = enokiFlow.$zkLoginState.get().address;

        if (cancelled) return;

        if (!address) {
          throw new Error('zkLogin did not return a Sui address.');
        }

        setStatus('Loading your profile...');

        const user = await authApi.getOrCreateUserBySuiAddress(address, {
          // Enoki includes the user's email in the JWT when the OAuth scope
          // requested it. We do not request `email` by default; this stays
          // undefined unless Enoki is configured to forward it.
          email: undefined,
        });

        if (cancelled) return;

        navigate(user.hasOnboarded ? '/' : '/onboarding', { replace: true });
        return session;
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        console.error('zkLogin callback failed:', err);
        setError(message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enokiFlow, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden">
      <div className="ambient-glow" />
      <div className="w-full max-w-md relative z-10 text-center">
        <div className="glass-surface border border-[var(--cuerate-text-3)] rounded-[var(--cuerate-r-xl)] p-8 card-top-edge">
          {error ? (
            <>
              <h1 className="font-primary font-bold text-xl text-[var(--cuerate-text-1)] mb-3">
                Could not finish sign-in
              </h1>
              <p className="font-accent text-sm text-red-300 mb-4 break-words">{error}</p>
              <button
                onClick={() => navigate('/auth', { replace: true })}
                className="w-full rounded-[var(--cuerate-r-pill)] bg-[var(--cuerate-indigo)] px-4 py-3 font-accent text-sm font-medium text-white indigo-glow hover:opacity-90 transition-opacity"
              >
                Back to sign-in
              </button>
            </>
          ) : (
            <>
              <div className="flex justify-center mb-4">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--cuerate-blue)]" />
              </div>
              <h1 className="font-primary font-bold text-xl text-[var(--cuerate-text-1)] mb-1">
                {status}
              </h1>
              <p className="font-accent text-xs text-[var(--cuerate-text-2)]">
                Deriving your Sui wallet from your Google credential.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

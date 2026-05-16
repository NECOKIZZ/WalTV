import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useEnokiFlow, useZkLoginSession, useZkLogin } from '@mysten/enoki/react';
import { authApi } from './backend';
import { firebaseEnabled } from './firebase';
import { User } from './types';
import { getZkLoginRedirectUrl, googleClientId, isEnokiConfigured, suiNetwork } from './sui';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  // Sui address resolved from the active zkLogin session (or null when signed out).
  suiAddress: string | null;
  // Kicks off Google OAuth via Enoki. Returns the URL to redirect to so the
  // caller controls when the navigation happens; pass `redirect: true` to
  // navigate immediately (the common case).
  signInWithGoogle: (opts?: { redirect?: boolean }) => Promise<string>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const enokiFlow = useEnokiFlow();
  const zkSession = useZkLoginSession();
  const zkState = useZkLogin();
  const suiAddress = (zkState?.address ?? null) as string | null;

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // When the zkLogin session changes, sync the Firestore user record.
  useEffect(() => {
    let cancelled = false;

    if (!suiAddress) {
      // Signed out. Fall back to the local-storage cached profile so mock
      // mode (no Firebase, no Enoki) still has a user.
      if (!firebaseEnabled) {
        void authApi.getCurrentUser().then((cached) => {
          if (!cancelled) {
            setUser(cached);
            setIsLoading(false);
          }
        });
      } else {
        setUser(null);
        setIsLoading(false);
      }
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    void authApi
      .getOrCreateUserBySuiAddress(suiAddress)
      .then((loaded) => {
        if (!cancelled) {
          setUser(loaded);
        }
      })
      .catch((error) => {
        console.error('Could not load user for Sui address:', error);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [suiAddress, zkSession?.jwt]);

  const signInWithGoogle = useCallback(
    async (opts: { redirect?: boolean } = { redirect: true }) => {
      if (!isEnokiConfigured) {
        throw new Error(
          'Enoki is not configured. Set VITE_ENOKI_PUBLIC_API_KEY and VITE_GOOGLE_CLIENT_ID.',
        );
      }

      const url = await enokiFlow.createAuthorizationURL({
        provider: 'google',
        clientId: googleClientId,
        redirectUrl: getZkLoginRedirectUrl(),
        network: suiNetwork === 'devnet' ? 'devnet' : suiNetwork,
      });

      if (opts.redirect !== false && typeof window !== 'undefined') {
        window.location.assign(url);
      }

      return url;
    },
    [enokiFlow],
  );

  const signOut = useCallback(async () => {
    try {
      await enokiFlow.logout();
    } catch (error) {
      console.warn('Enoki logout error (continuing):', error);
    }
    await authApi.signOut();
    setUser(null);
  }, [enokiFlow]);

  return (
    <AuthContext.Provider value={{ user, isLoading, suiAddress, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return context;
}

import { RouterProvider } from 'react-router';
import { router } from './routes';
import { AuthProvider } from '../lib/auth-context';
import { firebaseEnabled } from '../lib/firebase';
import { isEnokiConfigured } from '../lib/sui';

function App() {
  if (import.meta.env.PROD && (!firebaseEnabled || !isEnokiConfigured)) {
    const missing: string[] = [];
    if (!firebaseEnabled) missing.push('Firebase Firestore');
    if (!isEnokiConfigured) missing.push('Enoki zkLogin (VITE_ENOKI_PUBLIC_API_KEY + VITE_GOOGLE_CLIENT_ID)');

    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-lg w-full glass-surface rounded-[var(--waltube-r-xl)] border border-red-500/30 p-8 text-center">
          <h1 className="font-primary font-bold text-2xl text-[var(--waltube-text-1)] mb-3">
            Backend Configuration Required
          </h1>
          <p className="font-accent text-sm text-[var(--waltube-text-2)]">
            Missing required configuration: {missing.join(' and ')}. Set the matching env vars before going live.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

export default App;

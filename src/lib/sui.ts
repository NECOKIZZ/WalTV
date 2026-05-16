// Sui + Enoki configuration. One source of truth for the network selection,
// the Google OAuth client id, and the JSON-RPC fullnode URLs.
//
// Note: @mysten/sui v2 renamed `SuiClient` -> `SuiJsonRpcClient` and moved
// it to the `@mysten/sui/jsonRpc` subpath. We don't construct the client
// here \u2014 SuiClientProvider does it internally from the `networks` prop \u2014
// so this file only exposes configuration values.

type SuiNetwork = 'testnet' | 'mainnet' | 'devnet';

const FULLNODE_URLS: Record<SuiNetwork, string> = {
  testnet: 'https://fullnode.testnet.sui.io:443',
  mainnet: 'https://fullnode.mainnet.sui.io:443',
  devnet: 'https://fullnode.devnet.sui.io:443',
};

function readEnv(key: string): string {
  const raw = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof raw === 'string' ? raw.trim() : '';
}

function resolveNetwork(): SuiNetwork {
  const raw = readEnv('VITE_SUI_NETWORK').toLowerCase();
  if (raw === 'mainnet' || raw === 'devnet') return raw;
  return 'testnet';
}

export const suiNetwork: SuiNetwork = resolveNetwork();

export const suiNetworkConfig = {
  testnet: { url: FULLNODE_URLS.testnet },
  mainnet: { url: FULLNODE_URLS.mainnet },
  devnet: { url: FULLNODE_URLS.devnet },
} as const;

export const enokiPublicApiKey = readEnv('VITE_ENOKI_PUBLIC_API_KEY');

// The Google OAuth Web client id. Must be the same one registered in:
//   1. Google Cloud Console (with our redirect URI in the allowed list)
//   2. Enoki Portal \u2192 Auth Providers \u2192 Google
export const googleClientId = readEnv('VITE_GOOGLE_CLIENT_ID');

export const isEnokiConfigured = enokiPublicApiKey.length > 0 && googleClientId.length > 0;

// Where Google sends the user after they approve sign-in. Must match
// exactly what is registered in Google Cloud Console.
export function getZkLoginRedirectUrl(): string {
  if (typeof window === 'undefined') {
    return '/auth/zklogin-callback';
  }
  return `${window.location.origin}/auth/zklogin-callback`;
}

// Truncate a Sui address for UI display: 0x1234ab...ef56
export function shortenSuiAddress(address: string | null | undefined): string {
  if (!address || typeof address !== 'string') return '';
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

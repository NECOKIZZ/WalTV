import { EnokiClient } from '@mysten/enoki';

type ApiRequest = {
  method?: string;
  body?: unknown;
  headers?: { origin?: string };
};

type ApiResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): {
    json(body: unknown): void;
  };
};

const networks = new Set(['testnet', 'mainnet', 'devnet']);
const suiAddressPattern = /^0x[0-9a-fA-F]{64}$/;

function setCors(res: ApiResponse, origin: string | undefined) {
  const allowedOrigin = process.env.ENOKI_API_CORS_ORIGIN ?? 'http://localhost:5173';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (origin && origin !== allowedOrigin) {
    throw new Error('Invalid Origin header');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function getStringArray(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function isSuiAddress(value: string) {
  return suiAddressPattern.test(value);
}

function getAllowedTargets() {
  const attributionPackageId =
    process.env.VITE_WALTUBE_ATTRIBUTION_PACKAGE_ID ??
    process.env.WALTUBE_ATTRIBUTION_PACKAGE_ID ??
    '';

  const royaltiesPackageId =
    process.env.VITE_WALTUBE_ROYALTIES_PACKAGE_ID ??
    process.env.WALTUBE_ROYALTIES_PACKAGE_ID ??
    '';

  return new Set(
    [
      attributionPackageId && `${attributionPackageId}::attribution::record_prompt`,
      attributionPackageId && `${attributionPackageId}::attribution::record_fork`,
      royaltiesPackageId && `${royaltiesPackageId}::royalties::create_royalty_config`,
    ].filter(Boolean),
  );
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    setCors(res, req.headers?.origin);
  } catch {
    res.status(403).json({ error: 'Invalid Origin' });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(204).json({});
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const privateKey = process.env.ENOKI_PRIVATE_API_KEY;
  if (!privateKey) {
    res.status(500).json({ error: 'Missing ENOKI_PRIVATE_API_KEY' });
    return;
  }

  if (!isRecord(req.body)) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  const network = getString(req.body, 'network');
  const transactionKindBytes = getString(req.body, 'transactionKindBytes');
  const sender = getString(req.body, 'sender');
  const allowedAddresses = getStringArray(req.body, 'allowedAddresses');

  if (!network || !networks.has(network)) {
    res.status(400).json({ error: 'Invalid network' });
    return;
  }

  if (!transactionKindBytes) {
    res.status(400).json({ error: 'Missing transactionKindBytes' });
    return;
  }

  if (!sender || !isSuiAddress(sender)) {
    res.status(400).json({ error: 'Invalid sender address' });
    return;
  }

  if (allowedAddresses.length === 0) {
    res.status(400).json({ error: 'allowedAddresses is required' });
    return;
  }

  if (allowedAddresses.some((address) => !isSuiAddress(address))) {
    res.status(400).json({ error: 'Invalid allowed address' });
    return;
  }

  // Sender must always be in allowedAddresses (prevents spoofing recipient lists).
  if (!allowedAddresses.includes(sender)) {
    res.status(400).json({ error: 'Sender must be in allowedAddresses' });
    return;
  }

  // Derive allowed targets server-side — never trust the client.
  const allowedMoveCallTargets = Array.from(getAllowedTargets());
  if (allowedMoveCallTargets.length === 0) {
    res.status(500).json({ error: 'No allowed Move targets configured' });
    return;
  }

  try {
    const client = new EnokiClient({ apiKey: privateKey });

    const sponsored = await client.createSponsoredTransaction({
      network: network as 'testnet' | 'mainnet' | 'devnet',
      transactionKindBytes,
      sender,
      allowedAddresses,
      allowedMoveCallTargets,
    });

    res.status(200).json(sponsored);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sponsorship failed';
    res.status(502).json({ error: message });
  }
}

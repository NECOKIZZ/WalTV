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

  const digest = getString(req.body, 'digest');
  const signature = getString(req.body, 'signature');

  if (!digest || !signature) {
    res.status(400).json({ error: 'Missing digest or signature' });
    return;
  }

  // TODO: Add digest verification once a durable store (Redis/Firestore)
  // is available. In-memory tracking doesn't work across serverless instances.
  try {
    const client = new EnokiClient({ apiKey: privateKey });

    const result = await client.executeSponsoredTransaction({
      digest,
      signature,
    });

    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Execution failed';
    res.status(502).json({ error: message });
  }
}

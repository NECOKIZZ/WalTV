// Simple in-memory tracking of digests created by our sponsor endpoint.
// In a serverless environment this only protects within the same warm instance.
// For production-scale, replace with Redis / Firestore / Upstash.
const pendingDigests = new Set<string>();

export function trackDigest(digest: string) {
  pendingDigests.add(digest);
  // Auto-expire after 5 minutes to prevent memory bloat
  setTimeout(() => pendingDigests.delete(digest), 5 * 60 * 1000);
}

export function isPendingDigest(digest: string): boolean {
  return pendingDigests.has(digest);
}

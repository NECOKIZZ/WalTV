import { DependencyList, useEffect, useState } from 'react';

interface BackendQueryState<T> {
  data: T;
  error: string | null;
  isLoading: boolean;
}

export function useBackendQuery<T>(
  loader: () => Promise<T>,
  initialData: T,
  dependencies: DependencyList = [],
): BackendQueryState<T> {
  const [data, setData] = useState<T>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function run() {
      setIsLoading(true);
      setError(null);
      const start = performance.now();

      try {
        const result = await loader();
        const duration = Math.round(performance.now() - start);
        if (isMounted) {
          setData(result);
          console.log(`[useBackendQuery] ${duration}ms`);
        }
      } catch (err) {
        const duration = Math.round(performance.now() - start);
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Something went wrong while loading backend data.');
          console.error(`[useBackendQuery] FAILED after ${duration}ms:`, err);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void run();

    return () => {
      isMounted = false;
    };
  }, dependencies);

  return { data, error, isLoading };
}

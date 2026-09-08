import { useEffect, useState } from 'react';

/**
 * Spec 03: debounce the search box before refetching, since this now hits a real API instead
 * of filtering an in-memory array. Returns the value to *display* plus the settled value.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}

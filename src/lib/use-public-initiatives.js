'use client';

import { useEffect, useState } from 'react';

// Loads every initiative from the public (no-auth) endpoint. Fetched on mount so
// newly created or deleted initiatives are reflected without a rebuild.
export function usePublicInitiatives() {
  const [initiatives, setInitiatives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/initiatives/public', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load initiatives'))))
      .then((data) => {
        if (!cancelled) setInitiatives(data.initiatives || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { initiatives, loading, error };
}

'use client';

import { useEffect, useState } from 'react';
import { getAuthStore } from '@/lib/auth/auth-store';

export function useAuthStore() {
  const store = getAuthStore();
  const [user, setUser] = useState(null);
  // hydrated: the user is known. A user read from localStorage is not trusted
  // until the server confirms the session, so a stale login never renders.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Hydrate from localStorage on client mount only
    const sync = () => {
      setUser(store.getUser());
      setHydrated(store.isReady());
    };
    sync();
    const unsubscribe = store.subscribe(sync);
    // Validate localStorage matches server session
    store.validateSession();
    return unsubscribe;
  }, [store]);

  return {
    user: hydrated ? user : null,
    hydrated,
    setUser: (nextUser) => store.setUser(nextUser),
    clearUser: () => store.clearUser(),
    hasPermission: (key) => store.hasPermission(key),
  };
}

export default useAuthStore;

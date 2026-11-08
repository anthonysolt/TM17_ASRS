import EVENTS from '@/lib/events/event-types';
import { getUiEventBus } from '@/lib/events/ui-event-bus';

const STORAGE_KEY = 'user';

class AuthStore {
  constructor() {
    this.user = null;
    this.hydrated = false;
    // True once the server has confirmed (or denied) the session, or after an
    // explicit login/logout. Until then a localStorage user may be stale.
    this.sessionChecked = false;
    this._sessionPromise = null;
    this.listeners = new Set();
    this.uiBus = getUiEventBus();

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === STORAGE_KEY) {
          this.hydrateFromStorage();
          this.notify();
        }
      });
    }
  }

  hydrateFromStorage() {
    if (typeof window === 'undefined') return;

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      this.user = null;
      this.hydrated = true;
      return;
    }

    try {
      this.user = JSON.parse(raw);
    } catch {
      this.user = null;
    }

    this.hydrated = true;
  }

  ensureHydrated() {
    if (!this.hydrated) {
      this.hydrateFromStorage();
    }
  }

  /**
   * isReady — Whether the current user can be trusted for rendering. With no
   * stored user there is nothing stale to show; with one, wait for the server.
   */
  isReady() {
    this.ensureHydrated();
    return this.sessionChecked || !this.user;
  }

  validateSession() {
    if (typeof window === 'undefined') return Promise.resolve();
    if (this._sessionPromise) return this._sessionPromise;

    this._sessionPromise = fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((res) => {
        if (!res.ok) {
          // Server says no valid session — clear stale localStorage
          if (this.user) {
            this.setUser(null);
          }
          return;
        }
        return res.json().then((data) => {
          const serverUser = data.user;
          // Sync localStorage with server truth
          if (!this.user || this.user.user_id !== serverUser.user_id) {
            this.setUser(serverUser);
          }
        });
      })
      .catch(() => {
        // Network error — keep local state as-is
      })
      .finally(() => {
        this._sessionPromise = null;
        // setUser() above already marks the session checked and notifies.
        if (!this.sessionChecked) {
          this.sessionChecked = true;
          this.notify();
        }
      });
    return this._sessionPromise;
  }

  getUser() {
    this.ensureHydrated();
    return this.user;
  }

  setUser(user) {
    this.user = user || null;
    // An explicit login, logout, or server sync is authoritative.
    this.sessionChecked = true;
    if (typeof window !== 'undefined') {
      if (this.user) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.user));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    this.notify();
  }

  clearUser() {
    this.setUser(null);
  }

  hasPermission(key) {
    return Array.isArray(this.user?.permissions) && this.user.permissions.includes(key);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify() {
    const user = this.user;
    for (const listener of this.listeners) {
      try {
        listener(user);
      } catch (error) {
        console.error('[auth-store] listener failed:', error);
      }
    }
    this.uiBus.publish(EVENTS.AUTH_CHANGED, { user });
  }

  static getInstance() {
    if (!AuthStore.instance) {
      AuthStore.instance = new AuthStore();
    }
    return AuthStore.instance;
  }
}

export function getAuthStore() {
  return AuthStore.getInstance();
}

export { AuthStore };

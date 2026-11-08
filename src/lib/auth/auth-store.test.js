vi.mock('@/lib/events/ui-event-bus', () => ({
  getUiEventBus: () => ({ publish: vi.fn() }),
}));

import { AuthStore } from '@/lib/auth/auth-store';

const STALE_USER = { user_id: 1, email: 'staff@example.com', user_type: 'staff' };

function stubBrowser(storedUser, fetchImpl) {
  const storage = new Map();
  if (storedUser) storage.set('user', JSON.stringify(storedUser));
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  });
  const fetchMock = vi.fn(fetchImpl);
  vi.stubGlobal('fetch', fetchMock);
  return { storage, fetchMock };
}

function meResponse(status, user) {
  return Promise.resolve({ ok: status === 200, json: () => Promise.resolve({ user }) });
}

describe('AuthStore session readiness', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('a stored user is not ready until the server rejects it', async () => {
    const { storage } = stubBrowser(STALE_USER, () => meResponse(401));
    const store = new AuthStore();
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.getUser()).toEqual(STALE_USER);
    expect(store.isReady()).toBe(false);

    await store.validateSession();

    expect(store.getUser()).toBeNull();
    expect(store.isReady()).toBe(true);
    expect(storage.has('user')).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(null);
  });

  test('a stored user the server confirms becomes ready', async () => {
    stubBrowser(STALE_USER, () => meResponse(200, STALE_USER));
    const store = new AuthStore();
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.isReady()).toBe(false);
    await store.validateSession();

    expect(store.getUser()).toEqual(STALE_USER);
    expect(store.isReady()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('with no stored user it is ready immediately', () => {
    stubBrowser(null, () => meResponse(401));
    const store = new AuthStore();
    expect(store.isReady()).toBe(true);
  });

  test('a network error keeps the local user and still becomes ready', async () => {
    stubBrowser(STALE_USER, () => Promise.reject(new Error('offline')));
    const store = new AuthStore();

    await store.validateSession();

    expect(store.getUser()).toEqual(STALE_USER);
    expect(store.isReady()).toBe(true);
  });

  test('concurrent validations share one request', async () => {
    const { fetchMock } = stubBrowser(STALE_USER, () => meResponse(200, STALE_USER));
    const store = new AuthStore();

    const first = store.validateSession();
    const second = store.validateSession();
    expect(second).toBe(first);
    await first;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('an explicit login marks the session checked', () => {
    stubBrowser(null, () => meResponse(401));
    const store = new AuthStore();
    store.setUser(STALE_USER);
    expect(store.isReady()).toBe(true);
  });
});

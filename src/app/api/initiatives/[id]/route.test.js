const state = vi.hoisted(() => ({
  db: null,
  writeFileMock: vi.fn(),
}));

vi.mock('@/lib/container/service-container', () => ({
  getServiceContainer: () => ({ db: state.db }),
}));

vi.mock('fs', () => ({
  promises: {
    writeFile: (...args) => state.writeFileMock(...args),
  },
}));

import { PUT } from '@/app/api/initiatives/[id]/route';
import {
  closeTestDb,
  createAuthedRequestHeaders,
  createSessionForRank,
  createTestDb,
  insertInitiative,
} from '@/test/integration/api-test-harness';

describe('/api/initiatives/:id PUT', () => {
  beforeEach(() => {
    state.db = createTestDb();
    state.writeFileMock.mockReset();
    state.writeFileMock.mockResolvedValue(undefined);
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    closeTestDb(state.db);
    state.db = null;
  });

  test('preserves name and description for a settings-only update', async () => {
    const initiativeId = insertInitiative(state.db, {
      initiative_name: 'Existing Initiative',
      description: 'Existing description',
      settings: { status: 'Active', isPublic: false },
    });
    const tokens = createSessionForRank(state.db, { rank: 50, verified: 1 });
    const request = new Request(`http://localhost:3000/api/initiatives/${initiativeId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...createAuthedRequestHeaders(tokens, { csrf: true }),
      },
      body: JSON.stringify({ settings: { status: 'archived', isPublic: false } }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: String(initiativeId) }) });
    const row = state.db.prepare(
      'SELECT initiative_name, description, settings FROM initiative WHERE initiative_id = ?'
    ).get(initiativeId);

    expect(response.status).toBe(200);
    expect(row.initiative_name).toBe('Existing Initiative');
    expect(row.description).toBe('Existing description');
    expect(JSON.parse(row.settings).status).toBe('archived');
  });
});

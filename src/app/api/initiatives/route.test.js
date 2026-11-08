const state = vi.hoisted(() => ({
  db: null,
  readFileMock: vi.fn(),
  writeFileMock: vi.fn(),
}));

vi.mock('@/lib/container/service-container', () => ({
  getServiceContainer: () => ({ db: state.db }),
}));

vi.mock('fs', () => ({
  promises: {
    readFile: (...args) => state.readFileMock(...args),
    writeFile: (...args) => state.writeFileMock(...args),
  },
}));

import { GET, POST } from '@/app/api/initiatives/route';
import {
  closeTestDb,
  createAuthedRequestHeaders,
  createSessionForRank,
  createTestDb,
  insertInitiative,
} from '@/test/integration/api-test-harness';

describe('/api/initiatives integration', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    state.db = createTestDb();
    state.readFileMock.mockReset();
    state.writeFileMock.mockReset();
    state.readFileMock.mockResolvedValue(JSON.stringify({ initiatives: [] }));
    state.writeFileMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    closeTestDb(state.db);
    state.db = null;
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('GET returns initiatives from database', async () => {
    insertInitiative(state.db, { initiative_name: 'Career Prep', description: 'Desc 1' });

    const res = await GET();
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.initiatives).toHaveLength(1);
    expect(payload.initiatives[0].name).toBe('Career Prep');
  });

  test('GET counts each initiative\'s members', async () => {
    const initiativeId = insertInitiative(state.db, { initiative_name: 'Career Prep' });
    const emptyId = insertInitiative(state.db, { initiative_name: 'No Members' });
    const { user_type_id: typeId } = state.db.prepare("SELECT user_type_id FROM user_type WHERE type = 'public'").get();
    const addUser = (email) => Number(state.db.prepare(
      "INSERT INTO user (user_type_id, first_name, last_name, email, password) VALUES (?, 'A', 'B', ?, 'x')"
    ).run(typeId, email).lastInsertRowid);
    const addMember = state.db.prepare('INSERT INTO initiative_member (initiative_id, user_id, role) VALUES (?, ?, ?)');
    addMember.run(initiativeId, addUser('one@test.local'), 'participant');
    addMember.run(initiativeId, addUser('two@test.local'), 'staff');

    const payload = await (await GET()).json();
    const byId = Object.fromEntries(payload.initiatives.map((i) => [i.id, i]));

    expect(byId[initiativeId].member_count).toBe(2);
    expect(byId[emptyId].member_count).toBe(0);
  });

  test('POST returns 401 without session in non-test env', async () => {
    process.env.NODE_ENV = 'development';

    const req = new Request('http://localhost:3000/api/initiatives', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'No Auth Initiative' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  test('POST creates initiative with authenticated session and csrf', async () => {
    process.env.NODE_ENV = 'development';
    const tokens = createSessionForRank(state.db, { rank: 50, verified: 1 });

    const req = new Request('http://localhost:3000/api/initiatives', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...createAuthedRequestHeaders(tokens, { csrf: true }),
      },
      body: JSON.stringify({
        name: 'New Initiative',
        description: 'Created via test',
        attributes: ['Grade'],
        questions: ['How are you?'],
      }),
    });

    const res = await POST(req);
    const payload = await res.json();
    const row = state.db.prepare('SELECT initiative_name FROM initiative WHERE initiative_id = ?').get(payload.initiative.id);

    expect(res.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(row.initiative_name).toBe('New Initiative');
    expect(state.writeFileMock).toHaveBeenCalled();
  });
});

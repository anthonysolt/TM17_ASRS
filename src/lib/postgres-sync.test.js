import path from 'node:path';
import { PostgresSyncDatabase, toPostgres } from '@/lib/postgres-sync';

describe('toPostgres', () => {
  test('only converts real placeholders when question labels contain question marks', () => {
    const converted = toPostgres(`
      SELECT MAX(value_text) AS [What school do you attend?]
      FROM submission
      WHERE initiative_id = ? AND note = 'Really?'
    `);

    expect(converted).toContain('AS "What school do you attend?"');
    expect(converted).toContain("note = 'Really?'");
    expect(converted).toContain('initiative_id = $1');
    expect(converted).not.toContain('$2');
  });

  test('ignores question marks in SQL comments', () => {
    const converted = toPostgres('SELECT * FROM submission WHERE initiative_id = ? -- active?\nAND form_id = ? /* optional? */');
    expect(converted).toContain('initiative_id = $1');
    expect(converted).toContain('form_id = $2');
    expect(converted).toContain('-- active?');
    expect(converted).toContain('/* optional? */');
  });
});

describe('PostgresSyncDatabase worker handling', () => {
  const workerPath = path.join(process.cwd(), 'src', 'test', 'fixtures', 'postgres-sync-stub-worker.cjs');
  const openDb = () => new PostgresSyncDatabase('postgres://stub', { workerPath, timeoutMs: 300 });

  test('returns rows from the worker', () => {
    const db = openDb();
    expect(db.prepare('SELECT ? AS x').get(5)).toEqual({ text: 'SELECT $1 AS x', values: [5] });
    db.discardWorker();
  });

  test('passes worker errors through with their code', () => {
    const db = openDb();
    expect(() => db.prepare('SELECT FAIL').all()).toThrow(expect.objectContaining({ code: 'TEST_FAIL' }));
    db.discardWorker();
  });

  test('a worker that never replies times out instead of hanging, and the next query recovers', () => {
    const db = openDb();
    const firstWorker = db.worker;
    const started = Date.now();
    expect(() => db.prepare('SELECT HANG').all()).toThrow(expect.objectContaining({ code: 'QUERY_TIMEOUT' }));
    expect(Date.now() - started).toBeLessThan(5000);
    expect(db.prepare('SELECT 1').get()).toEqual({ text: 'SELECT 1', values: [] });
    expect(db.worker).not.toBe(firstWorker);
    db.discardWorker();
  });

  test('a crashed worker times out and is replaced', () => {
    const db = openDb();
    expect(() => db.prepare('SELECT CRASH').all()).toThrow(expect.objectContaining({ code: 'QUERY_TIMEOUT' }));
    expect(db.prepare('SELECT 2').get()).toEqual({ text: 'SELECT 2', values: [] });
    db.discardWorker();
  });
});

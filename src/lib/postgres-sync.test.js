import { toPostgres } from '@/lib/postgres-sync';

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

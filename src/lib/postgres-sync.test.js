import { toPostgres } from '@/lib/postgres-sync';

describe('toPostgres', () => {
  test('does not treat question marks in identifiers or strings as parameters', () => {
    const sql = `
      SELECT MAX(value_number) AS [How satisfied are you?]
      FROM submission
      WHERE initiative_id = ? AND note = 'Really?'
    `;

    const converted = toPostgres(sql);

    expect(converted).toContain('AS "How satisfied are you?"');
    expect(converted).toContain("note = 'Really?'");
    expect(converted).toContain('initiative_id = $1');
    expect(converted).not.toContain('$2');
  });

  test('numbers only actual placeholders across SQL comments', () => {
    const converted = toPostgres(`
      SELECT * FROM submission
      WHERE initiative_id = ? -- is this active?
        AND form_id = ? /* optional? */
    `);

    expect(converted).toContain('initiative_id = $1');
    expect(converted).toContain('form_id = $2');
    expect(converted).toContain('-- is this active?');
    expect(converted).toContain('/* optional? */');
  });
});

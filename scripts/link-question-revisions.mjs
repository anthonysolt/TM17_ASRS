/**
 * One-time backfill: link question revisions made before root_field_id existed.
 *
 * Before 20261007_question_lineage.sql, editing a question saved a new field
 * snapshot keyed `form_<formId>_v<version>_q<index>_<timestamp>` with no link
 * to the question it replaced. This links each snapshot to the question at the
 * same position in the previous version of the same form, when the type
 * matches, by copying that question's root_field_id.
 *
 * Usage (requires DATABASE_URL and the 20261007 migration):
 *   node scripts/link-question-revisions.mjs          # dry run, no changes
 *   node scripts/link-question-revisions.mjs --apply  # write the links
 */
import pg from 'pg';

const apply = process.argv.includes('--apply');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

const uiType = (row) => {
  try { return JSON.parse(row.validation_rules || '{}').ui_type || row.field_type; } catch { return row.field_type; }
};

await client.connect();
try {
  await client.query('BEGIN');

  const { rows: placements } = await client.query(`
    SELECT fq.form_question_id, fq.form_id, fq.field_id, fq.root_field_id, fvq.display_order,
           fv.form_version_id, fv.version_number, f.field_key, f.field_label, f.field_type, f.validation_rules
    FROM form_version_questions fvq
    JOIN form_questions fq ON fq.form_question_id = fvq.form_question_id
    JOIN form_version fv ON fv.form_version_id = fvq.form_version_id
    JOIN field f ON f.field_id = fq.field_id
    ORDER BY fq.form_id, fv.version_number, fvq.display_order
  `);

  const byVersion = new Map();
  for (const row of placements) {
    const key = `${row.form_id}:${row.version_number}`;
    if (!byVersion.has(key)) byVersion.set(key, []);
    byVersion.get(key).push(row);
  }

  const linked = [];
  const skipped = [];
  // Ascending version order so chains (v1 -> v2 -> v3) carry the original root.
  for (const row of placements) {
    const match = row.field_key.match(/^form_(\d+)_v(\d+)_q(\d+)_/);
    if (!match || Number(match[1]) !== row.form_id || Number(match[2]) !== row.version_number) continue;
    if (row.root_field_id !== row.field_id) continue; // already linked

    const index = Number(match[3]);
    const previous = (byVersion.get(`${row.form_id}:${row.version_number - 1}`) || [])
      .find(candidate => candidate.display_order === index);
    const reason = !previous ? 'no question at the same position in the previous version'
      : uiType(previous) !== uiType(row) ? `type changed (${uiType(previous)} -> ${uiType(row)})`
      : (byVersion.get(`${row.form_id}:${row.version_number}`) || [])
          .some(other => other !== row && other.root_field_id === previous.root_field_id)
        ? 'previous question is already linked to another question in this version'
      : null;

    if (reason) {
      skipped.push({ form: row.form_id, version: row.version_number, question: row.field_label, reason });
      continue;
    }

    await client.query('UPDATE form_questions SET root_field_id = $1 WHERE form_question_id = $2',
      [previous.root_field_id, row.form_question_id]);
    row.root_field_id = previous.root_field_id;
    linked.push({
      form: row.form_id,
      version: row.version_number,
      question: row.field_label,
      linkedTo: `${previous.field_label} (v${previous.version_number}, root ${previous.root_field_id})`,
    });
  }

  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${linked.length} linked, ${skipped.length} skipped`);
  if (linked.length) console.table(linked);
  if (skipped.length) console.table(skipped);

  await client.query(apply ? 'COMMIT' : 'ROLLBACK');
  if (!apply) console.log('No changes written. Re-run with --apply to save.');
} catch (error) {
  await client.query('ROLLBACK');
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end();
}

# Forms and Questions: Database Structure

How surveys, questions and answers are stored, and how survey edits keep answers linked to their questions.

## Overview

```
initiative
   └── form (a survey)
         └── form_version (v1, v2, v3…; one is "published")
               └── form_version_questions (which questions are on that version, and their order)
                     └── form_questions (a question's settings, shared by every version where it is unchanged)
                           ├── field_id      → field (the question wording and type)
                           └── root_field_id → field (the question's permanent ID across edits)

field
   └── field_options (answer choices)

submission (one response) → form + form_version
   └── submission_value (one answer) → form_questions
```

## Tables

| Table | What it holds |
|---|---|
| `field` | A question definition: label, type, scope, core/initiative flags. Never changed after it's created. |
| `field_options` | Answer choices for a field. |
| `form` | A survey: name, initiative, published flag. Its ID never changes. |
| `form_version` | One row per saved edit of a survey. Status is `draft`, `published` or `retired`, and only one version can be published. |
| `form_questions` | A question on a form: its field, required flag, help text and rules. One row is shared by every version where these are unchanged. |
| `form_version_questions` | Lists the questions on each form version, with their order. |
| `submission` | One person's response. Records which form version they answered. |
| `submission_value` | One answer, linked to the exact `form_questions` row the person saw. |

## How edits work

- **Saving an edit:** creates a new `form_version`.
- **Unchanged question:** the new version reuses the same `form_questions` row (and `field`); only a `form_version_questions` row is added. Reordering questions doesn't create new question rows.
- **Changed required flag or help text:** a new `form_questions` row with the same `field` and `root_field_id`.
- **Changed wording or options:** saved as a new `field` row, with the same `root_field_id`, so old and new answers stay linked.
- **Type change:** not allowed.
- **Added question:** starts a new `root_field_id`. Existing questions and answers aren't touched.
- **Removed question:** its `form_questions` rows (all versions), all its answers and its unused `field` rows are deleted. Shared core and initiative questions are kept.
- **Reports:** group answers by `root_field_id`, so each question appears once with its newest label. A saved report keeps the label and version from when it was generated.

## Migrations

Run them in this order (`database/migrations/`):

| Migration | What it does |
|---|---|
| `20260820_form_questions.sql` | Renames `form_field` to `form_questions`. Links answers to `form_question_id`. **Not safe to re-run.** |
| `20260820_core_initiative_questions.sql` | Adds the `is_core_question` and `is_initiative_specific` flags to `field`. |
| `20260821_qr_aggregate_counters.sql` | QR code counters. Not related to forms. |
| `20260923_form_versions.sql` | Adds `form_version`, and `form_version_id` on `form_questions` and `submission`. Drops the old `idx_form_field_unique` index. |
| `20261007_question_lineage.sql` | Adds `form_questions.root_field_id`, filled in as `field_id` for existing rows. Adds indexes, including one that stops a question appearing twice in the same version. |
| `20261008_goal_question_source.sql` | Lets a goal take its value from a survey question. |
| `20261008_shared_form_questions.sql` | Adds `form_version_questions`, merges identical `form_questions` rows (moving their answers to the kept row), and drops `form_questions.form_version_id` and `display_order`. Run with `npm run db:migrate:shared-form-questions`. **Not safe to re-run.** |

A database created from `database/schema.sql` already has this structure and doesn't need the migrations.

```bash
export $(grep "^DATABASE_URL" .env.local | xargs)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/20261007_question_lineage.sql
```

## One-time script

`scripts/link-question-revisions.mjs` links questions that were edited before `root_field_id` existed. It matches each edited copy to the question at the same position, with the same type, in the previous version.

```bash
node scripts/link-question-revisions.mjs           # dry run, writes nothing
node scripts/link-question-revisions.mjs --apply   # save the links
```

## Troubleshooting

`duplicate key value violates unique constraint "idx_form_field_unique"`: an older database still has this per-form index, which blocks versioning. Remove it:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP INDEX IF EXISTS idx_form_field_unique;"
```

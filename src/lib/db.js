//Database may be causing errors. 

import { PostgresSyncDatabase } from '@/lib/postgres-sync';
import { hashPassword, isPasswordHash } from '@/lib/auth/passwords';
import { alertDb } from '@/lib/db-alerts';
import { seedEgamingSurvey } from '@/app/manage-surveys/mauricesurvey';

// Store the database file in <project>/data/asrs.db

// Ensure the data directory exists

// Open (or create) the database — WAL mode for better concurrent read performance
const db = new PostgresSyncDatabase();

// Track whether tables have been created this process lifetime
let _initialized = false;

/**
 * Migration: Add missing columns to form table
 */
function migrationAddFormColumns() {
  try {
    db.exec(`ALTER TABLE form ADD COLUMN description TEXT;`);
  } catch (e) {
    // Column already exists, ignore error
  }

  try {
    db.exec(`ALTER TABLE form ADD COLUMN is_published INTEGER NOT NULL DEFAULT 0;`);
  } catch (e) {
    // Column already exists, ignore error
  }
}

/**
 * Migration: Fix field table to allow 'choice' field type
 *
 * The existing schema has a CHECK constraint on field_type that doesn't include 'choice'.
 * This migration recreates the field table with the correct constraint.
 */
function migrationFixFieldTableConstraint() {
  try {
    // Check if field table exists
    const fieldTableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='field'"
    ).get();

    if (!fieldTableExists) return; // Table doesn't exist yet, will be created normally

    // Query the CREATE TABLE statement to see what the current constraint is
    const fieldTableDef = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='field'"
    ).get();

    if (!fieldTableDef || !fieldTableDef.sql) return;

    // Check if 'choice' is already in the constraint
    if (fieldTableDef.sql.includes("'choice'")) {
      console.log('[db] Field table already has correct constraint');
      return;
    }

    // 'choice' is not in the constraint, need to recreate the table
    console.log('[db] Fixing field table CHECK constraint to include choice...');

    // First, clean up any leftover backup tables
    try {
      db.exec('DROP TABLE IF EXISTS field_backup;');
    } catch (e) {
      // Ignore
    }

    db.pragma('foreign_keys = OFF');
    try {
      db.exec(`
        BEGIN TRANSACTION;

        ALTER TABLE field RENAME TO field_backup;

        CREATE TABLE field (
          field_id INTEGER PRIMARY KEY AUTOINCREMENT,
          field_key TEXT NOT NULL UNIQUE,
          field_label TEXT NOT NULL,
          field_type TEXT NOT NULL CHECK (field_type IN ('text','number','date','boolean','select','multiselect','rating','json','choice','yesno')),
          scope TEXT NOT NULL DEFAULT 'common' CHECK (scope IN ('common','initiative_specific','staff_only')),
          initiative_id INTEGER REFERENCES initiative(initiative_id),
          is_filterable INTEGER NOT NULL DEFAULT 0,
          is_required_default INTEGER NOT NULL DEFAULT 0,
          validation_rules TEXT
        );

        INSERT INTO field (field_id, field_key, field_label, field_type, scope, initiative_id, is_filterable, is_required_default, validation_rules)
        SELECT field_id, field_key, field_label, field_type, scope, initiative_id, is_filterable, is_required_default, NULL
        FROM field_backup;

        DROP TABLE field_backup;

        COMMIT;
      `);
      console.log('[db] ✓ Field table fixed with choice constraint');
    } catch (migrationError) {
      try {
        db.exec('ROLLBACK;');
      } catch (e) {
        // Ignore
      }
      throw migrationError;
    } finally {
      db.pragma('foreign_keys = ON');
    }
  } catch (e) {
    try {
      db.pragma('foreign_keys = ON');
    } catch (e2) {
      // Ignore
    }
    console.error('[db] Migration error:', e.message);
    // Don't re-throw - allow app to continue
  }
}

/**
 * Migration: Repair foreign keys that incorrectly reference field_backup
 *
 * A previous field-table migration can leave dependent tables referencing
 * "field_backup" as the parent table. This migration rebuilds those tables
 * so they correctly reference "field".
 */
function migrationRepairFieldBackupForeignKeys() {
  const tableSpecs = [
    {
      name: 'field_options',
      temp: 'field_options_old',
      createSql: `
        CREATE TABLE field_options (
          field_option_id INTEGER PRIMARY KEY AUTOINCREMENT,
          field_id INTEGER NOT NULL REFERENCES field(field_id) ON DELETE CASCADE,
          option_value TEXT NOT NULL,
          display_label TEXT NOT NULL,
          display_order INTEGER NOT NULL DEFAULT 0
        );
      `,
      columns: 'field_option_id, field_id, option_value, display_label, display_order',
    },
    {
      name: 'form_field',
      temp: 'form_field_old',
      createSql: `
        CREATE TABLE form_field (
          form_field_id INTEGER PRIMARY KEY AUTOINCREMENT,
          form_id INTEGER NOT NULL REFERENCES form(form_id) ON DELETE CASCADE,
          field_id INTEGER NOT NULL REFERENCES field(field_id),
          display_order INTEGER NOT NULL DEFAULT 0,
          required INTEGER NOT NULL DEFAULT 0,
          is_hidden INTEGER NOT NULL DEFAULT 0,
          help_text TEXT,
          validation_rules TEXT
        );
      `,
      columns: 'form_field_id, form_id, field_id, display_order, required, is_hidden, help_text, validation_rules',
    },
    {
      name: 'submission_value',
      temp: 'submission_value_old',
      createSql: `
        CREATE TABLE submission_value (
          submission_value_id INTEGER PRIMARY KEY AUTOINCREMENT,
          submission_id INTEGER NOT NULL REFERENCES submission(submission_id) ON DELETE CASCADE,
          field_id INTEGER NOT NULL REFERENCES field(field_id),
          value_text TEXT,
          value_number REAL,
          value_date TEXT,
          value_bool INTEGER,
          value_json TEXT,
          UNIQUE(submission_id, field_id)
        );
      `,
      columns: 'submission_value_id, submission_id, field_id, value_text, value_number, value_date, value_bool, value_json',
    },
  ];

  try {
    for (const spec of tableSpecs) {
      const tableExists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
      ).get(spec.name);
      if (!tableExists) continue;

      const fkRows = db.prepare(`PRAGMA foreign_key_list(${spec.name})`).all();
      const needsRepair = fkRows.some((row) => row.table === 'field_backup');
      if (!needsRepair) continue;

      console.log(`[db] Repairing foreign key references for ${spec.name}...`);

      db.pragma('foreign_keys = OFF');
      try {
        db.exec('BEGIN TRANSACTION;');
        db.exec(`DROP TABLE IF EXISTS ${spec.temp};`);
        db.exec(`ALTER TABLE ${spec.name} RENAME TO ${spec.temp};`);
        db.exec(spec.createSql);
        db.exec(`
          INSERT INTO ${spec.name} (${spec.columns})
          SELECT ${spec.columns}
          FROM ${spec.temp};
        `);
        db.exec(`DROP TABLE ${spec.temp};`);
        db.exec('COMMIT;');
        console.log(`[db] ✓ Repaired ${spec.name}`);
      } catch (error) {
        try {
          db.exec('ROLLBACK;');
        } catch (rollbackError) {
          // Ignore
        }
        throw error;
      } finally {
        db.pragma('foreign_keys = ON');
      }
    }
  } catch (error) {
    try {
      db.pragma('foreign_keys = ON');
    } catch (e) {
      // Ignore
    }
    console.error('[db] Foreign key repair migration error:', error.message);
  }
}

// Initialize database schema on module load
initializeDatabase();

/**
 * Create all tables, indexes, and seed data if they don't already exist.
 * Covers the full ASRS schema (design doc) plus the legacy survey tables.
 * Safe to call multiple times — the first successful call sets the flag.
 */
function initializeDatabase() {
  if (_initialized) return;

  try {
    // ── Migrations for existing databases ──────────────────────────────
    // The SQLite table-rebuild migrations are intentionally not run here.
    // PostgreSQL keeps foreign keys and CHECK constraints in place on ALTER.

    // Migration: add created_at / updated_at to initiative table
    try { db.exec('ALTER TABLE initiative ADD COLUMN created_at TEXT'); } catch (e) { /* already exists */ }
    try { db.exec('ALTER TABLE initiative ADD COLUMN updated_at TEXT'); } catch (e) { /* already exists */ }
    try { db.exec("UPDATE initiative SET created_at = datetime('now'), updated_at = datetime('now') WHERE created_at IS NULL"); } catch (e) { /* ignore */ }


    // Migration: initiative_member table for membership management
    db.exec(`
      CREATE TABLE IF NOT EXISTS initiative_member (
        member_id INTEGER PRIMARY KEY AUTOINCREMENT,
        initiative_id INTEGER NOT NULL REFERENCES initiative(initiative_id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES user(user_id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'participant',
        joined_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(initiative_id, user_id)
      )
    `);

    // Migration: ensure public users have reporting.view permission
    try {
      const publicHasReporting = db.prepare(`
        SELECT 1 FROM role_permission rp
        JOIN user_type ut ON ut.user_type_id = rp.user_type_id
        JOIN permission p ON p.permission_id = rp.permission_id
        WHERE ut.type = 'public' AND p.key = 'reporting.view'
      `).get();
      if (!publicHasReporting) {
        db.prepare(`
          INSERT OR IGNORE INTO role_permission (user_type_id, permission_id)
          SELECT ut.user_type_id, p.permission_id
          FROM user_type ut, permission p
          WHERE ut.type = 'public' AND p.key = 'reporting.view'
        `).run();
        console.log('[db] Added reporting.view permission for public users');
      }
    } catch (e) {
      console.warn('[db] public reporting permission migration:', e.message);
    }

    // ── Design-doc tables ──────────────────────────────────

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_type (
      user_type_id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL UNIQUE,
      access_rank INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS user (
      user_id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      phone_number TEXT,
      user_type_id INTEGER REFERENCES user_type(user_type_id),
      verified INTEGER NOT NULL DEFAULT 0,
      verification_token TEXT,
      token_expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS session (
      session_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES user(user_id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      csrf_token TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      absolute_expires_at TEXT NOT NULL,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS initiative (
      initiative_id INTEGER PRIMARY KEY AUTOINCREMENT,
      initiative_name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS field (
      field_id INTEGER PRIMARY KEY AUTOINCREMENT,
      field_key TEXT NOT NULL UNIQUE,
      field_label TEXT NOT NULL,
      field_type TEXT NOT NULL CHECK (field_type IN ('text','number','date','boolean','select','multiselect','rating','json','choice','yesno')),
      scope TEXT NOT NULL DEFAULT 'common' CHECK (scope IN ('common','initiative_specific','staff_only')),
      initiative_id INTEGER REFERENCES initiative(initiative_id),
      is_filterable INTEGER NOT NULL DEFAULT 0,
      is_required_default INTEGER NOT NULL DEFAULT 0,
      validation_rules TEXT
    );

    CREATE TABLE IF NOT EXISTS field_options (
      field_option_id INTEGER PRIMARY KEY AUTOINCREMENT,
      field_id INTEGER NOT NULL REFERENCES field(field_id) ON DELETE CASCADE,
      option_value TEXT NOT NULL,
      display_label TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS form (
      form_id INTEGER PRIMARY KEY AUTOINCREMENT,
      initiative_id INTEGER NOT NULL REFERENCES initiative(initiative_id),
      form_name TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      updated_by_user_id INTEGER REFERENCES user(user_id),
      is_published INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS form_field (
      form_field_id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL REFERENCES form(form_id) ON DELETE CASCADE,
      field_id INTEGER NOT NULL REFERENCES field(field_id),
      display_order INTEGER NOT NULL DEFAULT 0,
      required INTEGER NOT NULL DEFAULT 0,
      is_hidden INTEGER NOT NULL DEFAULT 0,
      help_text TEXT,
      validation_rules TEXT
    );

    CREATE TABLE IF NOT EXISTS submission (
      submission_id INTEGER PRIMARY KEY AUTOINCREMENT,
      initiative_id INTEGER NOT NULL REFERENCES initiative(initiative_id),
      form_id INTEGER NOT NULL REFERENCES form(form_id),
      submitted_at TEXT DEFAULT (datetime('now')),
      submitted_by_user_id INTEGER REFERENCES user(user_id)
    );

      CREATE TABLE IF NOT EXISTS submission_value (
        submission_value_id INTEGER PRIMARY KEY AUTOINCREMENT,
        submission_id INTEGER NOT NULL REFERENCES submission(submission_id) ON DELETE CASCADE,
        field_id INTEGER NOT NULL REFERENCES field(field_id),
        value_text TEXT,
        value_number REAL,
        value_date TEXT,
        value_bool INTEGER,
        value_json TEXT,
        UNIQUE(submission_id, field_id)
      );

      CREATE TABLE IF NOT EXISTS report_template (
        report_template_id INTEGER PRIMARY KEY AUTOINCREMENT,
        initiative_id INTEGER NOT NULL REFERENCES initiative(initiative_id),
        template_name TEXT NOT NULL,
        description TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        is_public INTEGER NOT NULL DEFAULT 0,
        created_by_user_id INTEGER REFERENCES user(user_id),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        config_json TEXT NOT NULL DEFAULT '{}',
        form_id INTEGER REFERENCES form(form_id)
      );

    CREATE TABLE IF NOT EXISTS report_generation (
      report_generation_id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_template_id INTEGER NOT NULL REFERENCES report_template(report_template_id),
      run_by_user_id INTEGER REFERENCES user(user_id),
      run_at TEXT DEFAULT (datetime('now')),
      output_ref TEXT
    );

    CREATE TABLE IF NOT EXISTS feature (
      feature_id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT
    );

      -- QR code tables (US-011: generate QR codes for surveys/reports)

      CREATE TABLE IF NOT EXISTS qr_codes (
        qr_code_id INTEGER PRIMARY KEY AUTOINCREMENT,
        qr_code_key TEXT NOT NULL UNIQUE,
        qr_type TEXT NOT NULL CHECK (qr_type IN ('survey','report','survey_template')),
        target_id INTEGER,
        target_url TEXT NOT NULL,
        created_by_user_id INTEGER REFERENCES user(user_id),
        expires_at TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        description TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

    CREATE TABLE IF NOT EXISTS qr_scans (
      scan_id INTEGER PRIMARY KEY AUTOINCREMENT,
      qr_code_id INTEGER NOT NULL REFERENCES qr_codes(qr_code_id) ON DELETE CASCADE,
      ip_address TEXT,
      user_agent TEXT,
      referrer TEXT,
      converted_to_submission INTEGER,
      scanned_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_qr_codes_key ON qr_codes(qr_code_key);
    CREATE INDEX IF NOT EXISTS idx_qr_scans_code_id ON qr_scans(qr_code_id);
    CREATE INDEX IF NOT EXISTS idx_qr_scans_scanned_at ON qr_scans(scanned_at DESC);

    CREATE TABLE IF NOT EXISTS feature_access (
      feature_access_id INTEGER PRIMARY KEY AUTOINCREMENT,
      feature_id INTEGER NOT NULL UNIQUE REFERENCES feature(feature_id),
      min_access_rank INTEGER NOT NULL DEFAULT 1
    );

    -- Permission-based role access (replaces access_rank system)

    CREATE TABLE IF NOT EXISTS permission (
      permission_id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS role_permission (
      role_permission_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_type_id INTEGER NOT NULL REFERENCES user_type(user_type_id) ON DELETE CASCADE,
      permission_id INTEGER NOT NULL REFERENCES permission(permission_id) ON DELETE CASCADE,
      UNIQUE(user_type_id, permission_id)
    );

    CREATE INDEX IF NOT EXISTS idx_role_permission_user_type ON role_permission(user_type_id);
    CREATE INDEX IF NOT EXISTS idx_role_permission_permission ON role_permission(permission_id);

    -- Legacy tables (current /api/surveys and /api/reports routes)

      CREATE TABLE IF NOT EXISTS surveys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        responses TEXT NOT NULL,
        submitted_at TEXT DEFAULT (datetime('now'))
      );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      survey_id INTEGER REFERENCES surveys(id) ON DELETE CASCADE,
      initiative_id INTEGER REFERENCES initiative(initiative_id),
      name TEXT NOT NULL DEFAULT '',
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'completed'
        CHECK (status IN ('generating','completed','failed','published','draft','archived')),
      created_by TEXT DEFAULT '',
      report_data TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS report_generation_log (
      log_id INTEGER PRIMARY KEY AUTOINCREMENT,
      initiative_id INTEGER REFERENCES initiative(initiative_id),
      report_id INTEGER REFERENCES reports(id),
      status TEXT NOT NULL CHECK (status IN ('started','completed','failed')),
      duration_ms INTEGER NOT NULL DEFAULT 0,
      input_rows INTEGER NOT NULL DEFAULT 0,
      output_rows INTEGER NOT NULL DEFAULT 0,
      filters_count INTEGER NOT NULL DEFAULT 0,
      expressions_count INTEGER NOT NULL DEFAULT 0,
      sorts_count INTEGER NOT NULL DEFAULT 0,
      trend_variables_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

      -- Survey distribution table (US-010: distribute surveys with deadlines)

      CREATE TABLE IF NOT EXISTS survey_distribution (
        distribution_id INTEGER PRIMARY KEY AUTOINCREMENT,
        survey_template_id TEXT NOT NULL,
        title TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','closed')),
        recipient_emails TEXT NOT NULL DEFAULT '[]',
        response_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        created_by_user_id INTEGER REFERENCES user(user_id)
      );

      -- Initiative goals table (US-014: set goals with scoring criteria)

      CREATE TABLE IF NOT EXISTS initiative_goal (
        goal_id INTEGER PRIMARY KEY AUTOINCREMENT,
        initiative_id INTEGER NOT NULL REFERENCES initiative(initiative_id) ON DELETE CASCADE,
        goal_name TEXT NOT NULL,
        description TEXT,
        target_metric TEXT NOT NULL,
        target_value REAL NOT NULL,
        current_value REAL NOT NULL DEFAULT 0,
        weight REAL NOT NULL DEFAULT 1.0,
        scoring_method TEXT NOT NULL DEFAULT 'linear'
          CHECK (scoring_method IN ('linear','threshold','binary')),
        deadline TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        created_by_user_id INTEGER REFERENCES user(user_id)
      );

      -- Categories table (global categories for organizing data)

      CREATE TABLE IF NOT EXISTS category (
        category_id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Junction table for many-to-many relationship between initiatives and categories

      CREATE TABLE IF NOT EXISTS initiative_category (
        initiative_category_id INTEGER PRIMARY KEY AUTOINCREMENT,
        initiative_id INTEGER NOT NULL REFERENCES initiative(initiative_id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES category(category_id) ON DELETE CASCADE,
        added_at TEXT DEFAULT (datetime('now')),
        UNIQUE(initiative_id, category_id)
      );

      CREATE TABLE IF NOT EXISTS initiative_budget (
        budget_id INTEGER PRIMARY KEY AUTOINCREMENT,
        initiative_id INTEGER NOT NULL REFERENCES initiative(initiative_id) ON DELETE CASCADE,
        fiscal_year INTEGER NOT NULL,
        department TEXT NOT NULL DEFAULT 'General',
      personnel REAL NOT NULL DEFAULT 0 CHECK (personnel >= 0),
      equipment REAL NOT NULL DEFAULT 0 CHECK (equipment >= 0),
        operations REAL NOT NULL DEFAULT 0 CHECK (operations >= 0),
      travel REAL NOT NULL DEFAULT 0 CHECK (travel >= 0),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(initiative_id, fiscal_year)
      );

      CREATE TABLE IF NOT EXISTS initiative_budget_history (
        history_id INTEGER PRIMARY KEY AUTOINCREMENT,
        budget_id INTEGER NOT NULL REFERENCES initiative_budget(budget_id) ON DELETE CASCADE,
        initiative_id INTEGER NOT NULL REFERENCES initiative(initiative_id) ON DELETE CASCADE,
        fiscal_year INTEGER NOT NULL,
        department TEXT NOT NULL,
      personnel REAL NOT NULL DEFAULT 0 CHECK (personnel >= 0),
      equipment REAL NOT NULL DEFAULT 0 CHECK (equipment >= 0),
        operations REAL NOT NULL DEFAULT 0 CHECK (operations >= 0),
      travel REAL NOT NULL DEFAULT 0 CHECK (travel >= 0),
        changed_by_user_id INTEGER REFERENCES user(user_id),
        created_at TEXT DEFAULT (datetime('now'))
      );
    CREATE INDEX IF NOT EXISTS idx_initiative_budget_history_budget ON initiative_budget_history(budget_id);
    CREATE INDEX IF NOT EXISTS idx_initiative_budget_history_initiative ON initiative_budget_history(initiative_id);

      CREATE TABLE IF NOT EXISTS goal_progress_history (
        history_id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER NOT NULL REFERENCES initiative_goal(goal_id) ON DELETE CASCADE,
        initiative_id INTEGER NOT NULL REFERENCES initiative(initiative_id) ON DELETE CASCADE,
        recorded_value REAL NOT NULL,
      target_value REAL NOT NULL,
      score REAL NOT NULL,
        recorded_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_goal_history_initiative ON goal_progress_history(initiative_id, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_goal_history_goal ON goal_progress_history(goal_id, recorded_at);
      -- Indexes for performance optimization

    CREATE INDEX IF NOT EXISTS idx_goal_initiative ON initiative_goal(initiative_id);
    CREATE INDEX IF NOT EXISTS idx_category_name ON category(category_name);
      CREATE INDEX IF NOT EXISTS idx_initiative_category_initiative ON initiative_category(initiative_id);
    CREATE INDEX IF NOT EXISTS idx_initiative_category_category ON initiative_category(category_id);
    CREATE INDEX IF NOT EXISTS idx_submission_initiative_date ON submission(initiative_id, submitted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_submission_form_date ON submission(form_id, submitted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_submission_value_submission ON submission_value(submission_id);
    CREATE INDEX IF NOT EXISTS idx_submission_value_field ON submission_value(field_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_form_field_unique ON form_field(form_id, field_id);
    CREATE INDEX IF NOT EXISTS idx_surveys_submitted_at ON surveys(submitted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reports_survey_id ON reports(survey_id);
    CREATE INDEX IF NOT EXISTS idx_reports_initiative_id ON reports(initiative_id);
    CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_report_generation_log_created_at ON report_generation_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_report_generation_log_status ON report_generation_log(status);

      -- Trend data table: stores initiative trend analysis
      CREATE TABLE IF NOT EXISTS trend (
        trend_id INTEGER PRIMARY KEY AUTOINCREMENT,
        initiative_id INTEGER NOT NULL REFERENCES initiative(initiative_id) ON DELETE CASCADE,
        trend_key TEXT NOT NULL UNIQUE,
        report_id TEXT,
        attributes TEXT NOT NULL DEFAULT '[]',
        direction TEXT NOT NULL CHECK (direction IN ('up','down','stable')),
        magnitude REAL NOT NULL DEFAULT 0,
        time_period TEXT,
        enabled_display INTEGER NOT NULL DEFAULT 1,
        enabled_calc INTEGER NOT NULL DEFAULT 1,
        description TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_trend_initiative ON trend(initiative_id);

      -- Audit log table: records reasons for administrative changes
      CREATE TABLE IF NOT EXISTS audit_log (
      audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
      event TEXT NOT NULL,
        user_email TEXT,
        target_type TEXT,
      target_id TEXT,
        reason_type TEXT,
        reason_text TEXT,
      payload TEXT,
      created_at TEXT DEFAULT (datetime('now'))
      );
    CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_distribution_status ON survey_distribution(status);
    CREATE INDEX IF NOT EXISTS idx_distribution_dates ON survey_distribution(start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_session_user_id ON session(user_id);
    CREATE INDEX IF NOT EXISTS idx_session_expires_at ON session(expires_at);

    -- App settings: key-value store for runtime configuration
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    `);

  // Survey seeding removed — survey templates are managed via the DB directly.

  // ── Seed data ────────────────────────────────────────

  function addColumnIfNotExists(table, columnDef) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
    } catch (err) {
      if (!err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
        throw err;
      }
    }
  }
  // Add new initiative columns if they don't exist
  addColumnIfNotExists('initiative', 'description TEXT');
  addColumnIfNotExists('initiative', "attributes TEXT DEFAULT '[]'");
  addColumnIfNotExists('initiative', "questions TEXT DEFAULT '[]'");
  addColumnIfNotExists('initiative', "settings TEXT DEFAULT '{}'");
  addColumnIfNotExists('initiative', 'summary_json TEXT');
  addColumnIfNotExists('initiative', 'chart_data_json TEXT');
  addColumnIfNotExists('initiative', "created_at TEXT DEFAULT (datetime('now'))");
  addColumnIfNotExists('initiative', "updated_at TEXT DEFAULT (datetime('now'))");

  // User columns
  addColumnIfNotExists('user', 'verified INTEGER NOT NULL DEFAULT 0');
  addColumnIfNotExists('user', 'verification_token TEXT');
  addColumnIfNotExists('user', 'token_expires_at TEXT');

  // Goal columns
  addColumnIfNotExists('initiative_goal', 'deadline TEXT');

  // Budget spent columns 
  addColumnIfNotExists('initiative_budget', 'personnel_spent  REAL NOT NULL DEFAULT 0');
  addColumnIfNotExists('initiative_budget', 'equipment_spent  REAL NOT NULL DEFAULT 0');
  addColumnIfNotExists('initiative_budget', 'operations_spent REAL NOT NULL DEFAULT 0');
  addColumnIfNotExists('initiative_budget', 'travel_spent     REAL NOT NULL DEFAULT 0');

  // Reports columns
  addColumnIfNotExists('reports', 'display_order INTEGER NOT NULL DEFAULT 0');

  // Report generation log columns
  addColumnIfNotExists('report_generation_log', 'ai_status TEXT');
  addColumnIfNotExists('report_generation_log', 'ai_duration_ms INTEGER NOT NULL DEFAULT 0');

  // ── Password migration ───────────────────────────────────────────────────────

  const usersForMigration = db.prepare('SELECT user_id, password FROM user').all();
  const updatePasswordHash = db.prepare('UPDATE user SET password = ? WHERE user_id = ?');
  for (const row of usersForMigration) {
    const currentPassword = String(row.password || '');
    if (!currentPassword || isPasswordHash(currentPassword)) continue;
    updatePasswordHash.run(hashPassword(currentPassword), row.user_id);
  }

  // Add deadline column to goals if it doesn't exist
  addColumnIfNotExists('initiative_goal', 'deadline TEXT');

  // Goal edit conflicts (US-035: concurrent edit detection & admin resolution)
  db.exec(`
    CREATE TABLE IF NOT EXISTS goal_edit_conflict (
      conflict_id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER NOT NULL REFERENCES initiative_goal(goal_id) ON DELETE CASCADE,
      initiative_id INTEGER NOT NULL REFERENCES initiative(initiative_id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved')),
      resolution TEXT CHECK (resolution IS NULL OR resolution IN ('applied_proposal','rejected_proposal')),
      expected_updated_at TEXT NOT NULL,
      detected_server_updated_at TEXT NOT NULL,
      proposed_patch TEXT NOT NULL,
      server_snapshot TEXT NOT NULL,
      submitter_email TEXT NOT NULL,
      resolved_by_email TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_goal_edit_conflict_pending ON goal_edit_conflict(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_goal_edit_conflict_goal ON goal_edit_conflict(goal_id);
  `);

  // Goal edit conflicts (US-035: concurrent edit detection & admin resolution)
  db.exec(`
    CREATE TABLE IF NOT EXISTS goal_edit_conflict (
      conflict_id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER NOT NULL REFERENCES initiative_goal(goal_id) ON DELETE CASCADE,
      initiative_id INTEGER NOT NULL REFERENCES initiative(initiative_id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved')),
      resolution TEXT CHECK (resolution IN ('applied_proposal','rejected_proposal')),
      expected_updated_at TEXT NOT NULL,
      detected_server_updated_at TEXT NOT NULL,
      proposed_patch TEXT NOT NULL,
      server_snapshot TEXT NOT NULL,
      submitter_email TEXT NOT NULL,
      resolved_by_email TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_goal_edit_conflict_pending ON goal_edit_conflict(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_goal_edit_conflict_goal ON goal_edit_conflict(goal_id);
  `);

  // Add display_order column to reports if it doesn't exist (US-022)
  addColumnIfNotExists('reports', 'display_order INTEGER NOT NULL DEFAULT 0');

  // Add AI insight tracking columns to report_generation_log
  addColumnIfNotExists('report_generation_log', 'ai_status TEXT');
  addColumnIfNotExists('report_generation_log', 'ai_duration_ms INTEGER NOT NULL DEFAULT 0');

  const insertUserType = db.prepare(
    'INSERT OR IGNORE INTO user_type (type, access_rank) VALUES (?, ?)'
  );
  insertUserType.run('public', 10);
  insertUserType.run('staff', 50);
  insertUserType.run('admin', 100);

  // ── Seed permissions ──────────────────────────────────
  const seedPerm = db.prepare(
    'INSERT OR IGNORE INTO permission (key, label) VALUES (?, ?)'
  );
  seedPerm.run('surveys.take', 'Take Surveys');
  seedPerm.run('initiatives.manage', 'Initiatives');
  seedPerm.run('reporting.view', 'Reporting');
  seedPerm.run('reports.create', 'Report Creation');
  seedPerm.run('forms.create', 'Form Creation');
  seedPerm.run('surveys.distribute', 'Survey Distribution');
  seedPerm.run('goals.manage', 'Goals & Scoring');
  seedPerm.run('performance.view', 'Performance Dashboard');
  seedPerm.run('budgets.manage', 'Budget Reporting');
  seedPerm.run('conflicts.manage', 'Data Conflicts');
  seedPerm.run('users.manage', 'User Management');
  seedPerm.run('audit.view', 'Audit Logs');
  seedPerm.run('import.manage', 'Data Import');

  // ── Seed default role permissions ─────────────────────
  function seedRolePermission(roleType, permissionKey) {
    db.prepare(`
      INSERT OR IGNORE INTO role_permission (user_type_id, permission_id)
      SELECT ut.user_type_id, p.permission_id
      FROM user_type ut, permission p
      WHERE ut.type = ? AND p.key = ?
    `).run(roleType, permissionKey);
  }

  const allPermKeys = [
    'surveys.take', 'initiatives.manage', 'reporting.view', 'reports.create',
    'forms.create', 'surveys.distribute', 'goals.manage', 'performance.view',
    'budgets.manage', 'conflicts.manage', 'users.manage', 'audit.view', 'import.manage',
  ];
  for (const key of allPermKeys) seedRolePermission('admin', key);

  const staffPermKeys = [
    'surveys.take', 'initiatives.manage', 'reporting.view', 'reports.create',
    'forms.create', 'surveys.distribute', 'goals.manage', 'performance.view',
  ];
  for (const key of staffPermKeys) seedRolePermission('staff', key);

  seedRolePermission('public', 'surveys.take');
  seedRolePermission('public', 'reporting.view');

  // ── Seed initiative data from JSON files ──────────────
  function toCamelKey(displayName) {
    const words = displayName.trim().split(/\s+/);
    return words
      .map((w, i) => i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1))
      .join('');
  }

  const seedDataDir = path.join(process.cwd(), 'src', 'data');
  let initiativesJson = { initiatives: [] };
  let reportDataJson = { reports: {} };
  let trendDataJson = { trends: {} };
  try {
    initiativesJson = JSON.parse(fs.readFileSync(path.join(seedDataDir, 'initiatives.json'), 'utf-8'));
    reportDataJson = JSON.parse(fs.readFileSync(path.join(seedDataDir, 'reportData.json'), 'utf-8'));
    trendDataJson = JSON.parse(fs.readFileSync(path.join(seedDataDir, 'trendData.json'), 'utf-8'));
  } catch (e) {
    console.warn('[db] Could not load seed JSON files:', e.message);
  }

  // Upsert the 7 core initiatives with real data
  for (const init of initiativesJson.initiatives.slice(0, 7)) {
    const report = reportDataJson.reports[String(init.id)];
    const summaryJson = report ? JSON.stringify(report.summary) : null;
    const chartDataJson = report ? JSON.stringify(report.chartData) : null;
    const attrs = JSON.stringify(init.attributes || []);
    const desc = init.description || '';
    try {
      const exists = db.prepare('SELECT 1 FROM initiative WHERE initiative_id = ?').get(init.id);
      if (exists) {
        db.prepare(
          'UPDATE initiative SET initiative_name=?, description=?, attributes=?, summary_json=?, chart_data_json=? WHERE initiative_id=?'
        ).run(init.name, desc, attrs, summaryJson, chartDataJson, init.id);
      } else {
        db.prepare(
          'INSERT INTO initiative (initiative_id, initiative_name, description, attributes, summary_json, chart_data_json) VALUES (?,?,?,?,?,?)'
        ).run(init.id, init.name, desc, attrs, summaryJson, chartDataJson);
      }
    } catch (e) {
      console.warn(`[db] Could not upsert initiative ${init.id}:`, e.message);
    }
  }


  // Seed initiative budgets 
  const insertBudget = db.prepare(`
    INSERT OR IGNORE INTO initiative_budget
      (initiative_id, fiscal_year, department,
       personnel,  equipment,  operations,  travel,
       personnel_spent, equipment_spent, operations_spent, travel_spent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getInitiativeId = db.prepare(
    'SELECT initiative_id FROM initiative WHERE initiative_name = ?'
  );

  // Columns: name, year, dept, personnel, equipment, operations, travel,
  //          personnel_spent, equipment_spent, operations_spent, travel_spent
  const budgetSeeds = [
    ['Amazon Product Reimagining',   2024, 'General',    120000, 30000, 45000,  8000,  95000, 28000, 40000,  7500],
    ['Amazon Product Reimagining',   2025, 'General',    135000, 25000, 50000, 10000,  60000, 10000, 20000,  3000],
    ['Bags2School Initiative',       2024, 'Operations',  90000, 60000, 20000,  5000,  92000, 63000, 21000,  5200],
    ['Bags2School Initiative',       2025, 'Operations',  95000, 55000, 22000,  6000,  30000, 15000,  8000,  1500],
    ['Drive Safe Robotics',          2024, 'HR',          80000, 10000, 30000, 12000,  55000,  8000, 22000,  9000],
    ['Drive Safe Robotics',          2025, 'HR',          85000, 12000, 32000, 13000,  20000,  3000,  8000,  2000],
    ['E-Gaming and Careers',         2024, 'IT',         150000, 90000, 35000,  7000, 162000, 95000, 38000,  8000],
    ['E-Gaming and Careers',         2025, 'IT',         160000, 95000, 38000,  8000,  70000, 40000, 15000,  2000],
    ['ELA Achievement & Attendance', 2024, 'General',    200000, 40000, 60000, 15000, 185000, 38000, 55000, 14000],
    ['ELA Achievement & Attendance', 2025, 'General',    210000, 42000, 65000, 16000,  90000, 18000, 25000,  5000],
    ['Organization Proposals',       2024, 'Finance',     70000, 15000, 25000,  4000,  45000, 10000, 18000,  3000],
    ['PSLA Modified Track Team',     2024, 'Operations',  50000,  8000, 18000,  6000,  48000,  7500, 17000,  5800],
    ['PSLA Modified Track Team',     2025, 'Operations',  55000,  9000, 20000,  7000,  15000,  2000,  5000,  1000],
  ];

  for (const [name, year, dept, p, e, o, t, ps, es, os, ts] of budgetSeeds) {
    const init = getInitiativeId.get(name);
    if (!init) continue; // skip silently if initiative name doesn't match
    insertBudget.run(init.initiative_id, year, dept, p, e, o, t, ps, es, os, ts);
  }

  // ── Seed fields (unique field definitions) ──────────────
  const insertField = db.prepare(
    'INSERT OR IGNORE INTO field (field_key, field_label, field_type, scope, is_filterable) VALUES (?,?,?,?,?)'
  );
  insertField.run('grade', 'Grade', 'text', 'common', 1);
  insertField.run('school', 'School', 'text', 'common', 1);

  for (const [initId, report] of Object.entries(reportDataJson.reports)) {
    if (!report.tableData || report.tableData.length === 0) continue;
    const init = initiativesJson.initiatives.find(i => i.id === Number(initId));
    const sampleRow = report.tableData[0];
    for (const key of Object.keys(sampleRow)) {
      if (key === 'id' || key === 'grade' || key === 'school') continue;
      const label = init?.attributes?.find(a => toCamelKey(a) === key) || key;
      const fieldType = typeof sampleRow[key] === 'number' ? 'number' : 'text';
      insertField.run(key, label, fieldType, 'initiative_specific', 1);
    }
  }

  // ── Seed forms (1 per initiative) ──────────────────────
  const insertForm = db.prepare(
    'INSERT OR IGNORE INTO form (form_id, initiative_id, form_name) VALUES (?,?,?)'
  );
  for (const [initId] of Object.entries(reportDataJson.reports)) {
    const init = initiativesJson.initiatives.find(i => i.id === Number(initId));
    insertForm.run(Number(initId), Number(initId), `${init?.name || 'Initiative ' + initId} Survey`);
  }

  // ── Seed form_field (link fields to forms) ──────────────
  const getFieldId = db.prepare('SELECT field_id FROM field WHERE field_key = ?');
  const insertFormField = db.prepare(
    'INSERT OR IGNORE INTO form_field (form_id, field_id, display_order) VALUES (?,?,?)'
  );
  for (const [initId, report] of Object.entries(reportDataJson.reports)) {
    if (!report.tableData || report.tableData.length === 0) continue;
    const sampleRow = report.tableData[0];
    let order = 0;
    for (const key of Object.keys(sampleRow)) {
      if (key === 'id') continue;
      const fieldRow = getFieldId.get(key);
      if (fieldRow) {
        insertFormField.run(Number(initId), fieldRow.field_id, order++);
      }
    }
  }

  // ── Seed submissions + submission_values ────────────────
  const insertSubmission = db.prepare(
    'INSERT OR IGNORE INTO submission (submission_id, initiative_id, form_id) VALUES (?,?,?)'
  );
  const insertSubValue = db.prepare(
    'INSERT OR IGNORE INTO submission_value (submission_id, field_id, value_text, value_number) VALUES (?,?,?,?)'
  );

  let nextSubId = 1;
  for (const [initId, report] of Object.entries(reportDataJson.reports)) {
    if (!report.tableData) continue;
    for (const row of report.tableData) {
      insertSubmission.run(nextSubId, Number(initId), Number(initId));
      for (const [key, value] of Object.entries(row)) {
        if (key === 'id') continue;
        const fieldRow = getFieldId.get(key);
        if (!fieldRow) continue;
        const numVal = typeof value === 'number' ? value : null;
        insertSubValue.run(nextSubId, fieldRow.field_id, String(value), numVal);
      }
      nextSubId++;
    }
  }

  // ── Seed trend data from trendData.json ────────────────────────────────
  const insertTrend = db.prepare(
    'INSERT OR IGNORE INTO trend (trend_key, initiative_id, report_id, attributes, direction, magnitude, time_period, enabled_display, enabled_calc, description) VALUES (?,?,?,?,?,?,?,?,?,?)'
  );
  for (const [initId, trends] of Object.entries(trendDataJson.trends || {})) {
    for (const t of trends) {
      insertTrend.run(
        t.trendId, Number(initId), t.reportId || null,
        JSON.stringify(t.attributes), t.direction, t.magnitude,
        t.timePeriod, t.enabledDisplay ? 1 : 0, t.enabledCalc ? 1 : 0,
        t.description
      );
    }
  }
  // ── Survey seeds ───────────────────────────────────────────────────────────
  seedEgamingSurvey(db);

  const insertFeature = db.prepare(
    'INSERT OR IGNORE INTO feature (key, name, description) VALUES (?, ?, ?)'
  );
  insertFeature.run('FORM_VIEW', 'View Forms', 'View and fill out forms');
  insertFeature.run('FORM_EDIT', 'Edit Forms', 'Create and edit form definitions');
  insertFeature.run('REPORT_VIEW', 'View Reports', 'View generated reports');
  insertFeature.run('REPORT_CREATE_DEFAULT', 'Create Reports', 'Create and run report templates');
  insertFeature.run('ADMIN_USERS', 'Manage Users', 'Manage user accounts and permissions');
  insertFeature.run('GOAL_MANAGE', 'Manage Goals', 'Set and manage initiative goals with scoring criteria');
  insertFeature.run('REPORT_MANAGE', 'Manage Reports', 'Add, update, delete, and reorder reports');

  // Set feature access ranks
  const featureRows = db.prepare('SELECT feature_id, key FROM feature').all();
  const rankMap = {
    FORM_VIEW: 1,
    FORM_EDIT: 50,
    REPORT_VIEW: 10,
    REPORT_CREATE_DEFAULT: 50,
    ADMIN_USERS: 100,
    GOAL_MANAGE: 100,
    REPORT_MANAGE: 50,
  };
  const insertAccess = db.prepare(
    'INSERT OR IGNORE INTO feature_access (feature_id, min_access_rank) VALUES (?, ?)'
  );
  for (const row of featureRows) {
    if (rankMap[row.key] !== undefined) {
      insertAccess.run(row.feature_id, rankMap[row.key]);
    }
  }

  // ── Seed test accounts ──────────────────────────────
  // These are auto-created so teammates can log in immediately after cloning.
  // The /data directory is gitignored, so the DB is recreated locally for each dev.

  const adminType = db.prepare("SELECT user_type_id FROM user_type WHERE type = 'admin'").get();
  const staffType = db.prepare("SELECT user_type_id FROM user_type WHERE type = 'staff'").get();
  const publicType = db.prepare("SELECT user_type_id FROM user_type WHERE type = 'public'").get();

  const insertUser = db.prepare(
    'INSERT OR IGNORE INTO user (first_name, last_name, email, password, user_type_id, verified) VALUES (?, ?, ?, ?, ?, 1)'
  );
  if (adminType) {
    insertUser.run('Test', 'Admin', 'admin@test.com', hashPassword('admin123'), adminType.user_type_id);
  }
  if (staffType) {
    insertUser.run('Test', 'Staff', 'staff@test.com', hashPassword('staff123'), staffType.user_type_id);
  }
  if (publicType) {
    insertUser.run('Test', 'Public', 'public@test.com', hashPassword('public123'), publicType.user_type_id);
  }

  // Ensure seeded dev test accounts can log in without email verification.
  db.prepare(`
    UPDATE user
    SET verified = 1,
        verification_token = NULL,
        token_expires_at = NULL
    WHERE email IN ('admin@test.com', 'staff@test.com', 'public@test.com')
  `).run();

    _initialized = true;
    console.log('[db] PostgreSQL database initialized');
  } catch (err) {
    console.error('[db] ===== CRITICAL ERROR DURING DATABASE INITIALIZATION =====');
    console.error('[db] Error:', err.message);
    console.error('[db] Stack:', err.stack);
    try {
      // Send alert via configured channels (webhook / email) in addition to logging
      // fire-and-forget but do not block app startup
      alertDb(err, { location: 'initializeDatabase' }).catch(() => void 0);
    } catch (e) {
      // ignore alert errors
    }
    // Mark as initialized anyway to prevent infinite retry loops on startup
    _initialized = true;
  }
}

export { db, initializeDatabase };
export default db;

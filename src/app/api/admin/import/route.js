import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import Papa from 'papaparse';
import { getServiceContainer } from '@/lib/container/service-container';
import { requirePermission } from '@/lib/auth/server-auth';
import { logAudit } from '@/lib/audit';

const MAX_ROWS = 5000;

const TABLE_SCHEMAS = {
  initiative: {
    label: 'Initiatives',
    columns: {
      initiative_name: { type: 'text', required: true },
      description: { type: 'text' },
    },
    uniqueKey: 'initiative_name',
    autoId: 'initiative_id',
  },
  category: {
    label: 'Categories',
    columns: {
      category_name: { type: 'text', required: true },
      description: { type: 'text' },
    },
    uniqueKey: 'category_name',
    autoId: 'category_id',
  },
  initiative_attribute: {
    label: 'Initiative Attributes',
    columns: {
      name: { type: 'text', required: true },
      data_type: { type: 'enum', required: true, values: ['text', 'number', 'date', 'boolean', 'json'] },
      initiative_id: { type: 'fk', required: true, references: 'initiative' },
    },
    autoId: 'attribute_id',
  },
  field: {
    label: 'Fields',
    columns: {
      field_key: { type: 'text', required: true },
      field_label: { type: 'text', required: true },
      field_type: {
        type: 'enum',
        required: true,
        values: ['text', 'number', 'date', 'boolean', 'select', 'multiselect', 'rating', 'json', 'choice'],
      },
      scope: {
        type: 'enum',
        values: ['common', 'initiative_specific', 'staff_only'],
        default: 'common',
      },
      initiative_id: { type: 'fk', references: 'initiative' },
      attribute_id: { type: 'fk', references: 'initiative_attribute' },
      is_filterable: { type: 'boolean', default: 0 },
      is_required_default: { type: 'boolean', default: 0 },
    },
    uniqueKey: 'field_key',
    autoId: 'field_id',
  },
  field_options: {
    label: 'Field Options',
    columns: {
      field_id: { type: 'fk', required: true, references: 'field' },
      option_value: { type: 'text', required: true },
      display_label: { type: 'text', required: true },
      display_order: { type: 'integer', default: 0 },
    },
    autoId: 'field_option_id',
  },
  submission: {
    label: 'Submissions',
    columns: {
      initiative_id: { type: 'fk', required: true, references: 'initiative' },
      form_id: { type: 'fk', required: true, references: 'form' },
      submitted_at: { type: 'text' },
      submitted_by_user_id: { type: 'fk', references: 'user' },
    },
    autoId: 'submission_id',
  },
  submission_value: {
    label: 'Submission Values',
    columns: {
      submission_id: { type: 'fk', required: true, references: 'submission' },
      field_id: { type: 'fk', required: true, references: 'field' },
      value_text: { type: 'text' },
      value_number: { type: 'number' },
      value_date: { type: 'text' },
      value_bool: { type: 'boolean' },
      value_json: { type: 'text' },
    },
    autoId: 'submission_value_id',
  },
  initiative_budget: {
    label: 'Initiative Budgets',
    columns: {
      initiative_id: { type: 'fk', required: true, references: 'initiative' },
      fiscal_year: { type: 'integer', required: true },
      department: { type: 'text', default: 'General' },
      personnel: { type: 'number', default: 0 },
      equipment: { type: 'number', default: 0 },
      operations: { type: 'number', default: 0 },
      travel: { type: 'number', default: 0 },
      personnel_spent: { type: 'number', default: 0 },
      equipment_spent: { type: 'number', default: 0 },
      operations_spent: { type: 'number', default: 0 },
      travel_spent: { type: 'number', default: 0 },
    },
    autoId: 'budget_id',
  },
  surveys: {
    label: 'Survey Responses',
    columns: {
      name: { type: 'text', required: true },
      email: { type: 'text', required: true },
      responses: { type: 'text', required: true },
      submitted_at: { type: 'text' },
    },
    autoId: 'id',
  },
  user: {
    label: 'Users',
    columns: {
      first_name: { type: 'text', required: true },
      last_name: { type: 'text', required: true },
      email: { type: 'text', required: true },
      password: { type: 'text', required: true },
      phone_number: { type: 'text' },
      user_type_id: { type: 'integer', default: 1 },
      verified: { type: 'boolean', default: 1 },
    },
    uniqueKey: 'email',
    autoId: 'user_id',
  },
};

function parseFileContent(text, fileType) {
  if (fileType === 'json') {
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    if (rows.length === 0) throw new Error('JSON file contains no data');
    return rows;
  }

  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h) => h.trim(),
  });

  if (result.errors.length > 0) {
    const critical = result.errors.filter((e) => e.type === 'Quotes' || e.type === 'FieldMismatch');
    if (critical.length > 0) {
      throw new Error(`CSV parse error: ${critical[0].message} (row ${critical[0].row})`);
    }
  }

  if (result.data.length === 0) throw new Error('CSV file contains no data rows');
  return result.data;
}

function computePreviewToken(table, conflictMode, rows) {
  const hash = createHash('sha256');
  hash.update(JSON.stringify({ table, conflictMode, rowCount: rows.length, sample: rows.slice(0, 5) }));
  return hash.digest('hex');
}

function validateRow(row, schema, columnMapping, db, rowIndex) {
  const errors = [];
  const mapped = {};

  for (const [fileCol, dbCol] of Object.entries(columnMapping)) {
    if (!dbCol || dbCol === '__skip__') continue;
    const colSchema = schema.columns[dbCol];
    if (!colSchema) {
      errors.push(`Row ${rowIndex + 1}: unknown column "${dbCol}"`);
      continue;
    }

    let value = row[fileCol];
    if (value === undefined || value === null || value === '') {
      if (colSchema.required) {
        errors.push(`Row ${rowIndex + 1}: "${dbCol}" is required`);
      }
      mapped[dbCol] = colSchema.default !== undefined ? colSchema.default : null;
      continue;
    }

    value = String(value).trim();

    if (colSchema.type === 'integer' || colSchema.type === 'number') {
      const num = Number(value);
      if (isNaN(num)) {
        errors.push(`Row ${rowIndex + 1}: "${dbCol}" must be a number, got "${value}"`);
        continue;
      }
      mapped[dbCol] = num;
    } else if (colSchema.type === 'boolean') {
      const lower = value.toLowerCase();
      if (['1', 'true', 'yes'].includes(lower)) mapped[dbCol] = 1;
      else if (['0', 'false', 'no', ''].includes(lower)) mapped[dbCol] = 0;
      else {
        errors.push(`Row ${rowIndex + 1}: "${dbCol}" must be boolean, got "${value}"`);
        continue;
      }
    } else if (colSchema.type === 'enum') {
      if (!colSchema.values.includes(value)) {
        errors.push(`Row ${rowIndex + 1}: "${dbCol}" must be one of [${colSchema.values.join(', ')}], got "${value}"`);
        continue;
      }
      mapped[dbCol] = value;
    } else if (colSchema.type === 'fk') {
      const id = Number(value);
      if (isNaN(id) || id <= 0) {
        errors.push(`Row ${rowIndex + 1}: "${dbCol}" must be a positive integer ID, got "${value}"`);
        continue;
      }
      const refTable = colSchema.references;
      const pkCol = TABLE_SCHEMAS[refTable]?.autoId || `${refTable}_id`;
      try {
        const exists = db.prepare(`SELECT 1 FROM "${refTable}" WHERE "${pkCol}" = ?`).get(id);
        if (!exists) {
          errors.push(`Row ${rowIndex + 1}: "${dbCol}" references ${refTable}(${id}) which does not exist`);
          continue;
        }
      } catch {
        // If the referenced table isn't in our whitelist (e.g. 'user', 'form'),
        // just validate it's a number and trust the FK constraint
      }
      mapped[dbCol] = id;
    } else {
      mapped[dbCol] = value;
    }
  }

  // Check required columns that weren't in the mapping
  for (const [colName, colSchema] of Object.entries(schema.columns)) {
    if (colSchema.required && mapped[colName] === undefined) {
      const isMapped = Object.values(columnMapping).includes(colName);
      if (!isMapped) {
        errors.push(`Row ${rowIndex + 1}: required column "${colName}" is not mapped`);
      }
    }
  }

  return { mapped, errors };
}

function insertRows(db, table, schema, validRows, conflictMode) {
  const results = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  if (validRows.length === 0) return results;

  const columns = Object.keys(validRows[0]);
  const placeholders = columns.map(() => '?').join(', ');
  const colList = columns.map((c) => `"${c}"`).join(', ');

  let sql;
  if (conflictMode === 'upsert' && schema.uniqueKey) {
    const updateCols = columns
      .filter((c) => c !== schema.uniqueKey)
      .map((c) => `"${c}" = excluded."${c}"`)
      .join(', ');
    sql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})
           ON CONFLICT("${schema.uniqueKey}") DO UPDATE SET ${updateCols}`;
  } else if (conflictMode === 'skip' && schema.uniqueKey) {
    sql = `INSERT OR IGNORE INTO "${table}" (${colList}) VALUES (${placeholders})`;
  } else {
    sql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`;
  }

  const stmt = db.prepare(sql);

  const runAll = db.transaction((rows) => {
    for (let i = 0; i < rows.length; i++) {
      const values = columns.map((c) => rows[i][c] ?? null);
      try {
        const info = stmt.run(...values);
        if (conflictMode === 'skip' && info.changes === 0) {
          results.skipped++;
        } else if (conflictMode === 'upsert' && schema.uniqueKey) {
          // SQLite doesn't distinguish insert vs update in ON CONFLICT DO UPDATE
          results.inserted++;
        } else {
          results.inserted++;
        }
      } catch (err) {
        if (conflictMode === 'fail') {
          throw err;
        }
        results.errors.push(`Row ${i + 1}: ${err.message}`);
        results.skipped++;
      }
    }
  });

  runAll(validRows);
  return results;
}

export async function GET(request) {
  try {
    const { db } = getServiceContainer();
    const auth = requirePermission(request, db, 'import.manage', { requireCsrf: false });
    if (auth.error) return auth.error;

    const tables = Object.entries(TABLE_SCHEMAS).map(([key, schema]) => ({
      name: key,
      label: schema.label,
      columns: Object.entries(schema.columns).map(([colName, colDef]) => ({
        name: colName,
        type: colDef.type,
        required: !!colDef.required,
        values: colDef.values || null,
      })),
    }));

    return NextResponse.json({ success: true, tables });
  } catch (error) {
    console.error('/api/admin/import GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { db } = getServiceContainer();
    const auth = requirePermission(request, db, 'import.manage');
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    if (!['preview', 'execute'].includes(action)) {
      return NextResponse.json({ error: 'action must be "preview" or "execute"' }, { status: 400 });
    }

    const body = await request.json();
    const { table, fileContent, fileType, conflictMode, columnMapping } = body;

    if (!table || !TABLE_SCHEMAS[table]) {
      return NextResponse.json(
        { error: `Invalid table. Allowed: ${Object.keys(TABLE_SCHEMAS).join(', ')}` },
        { status: 400 }
      );
    }

    if (!fileContent || typeof fileContent !== 'string') {
      return NextResponse.json({ error: 'fileContent is required (string)' }, { status: 400 });
    }

    if (!['csv', 'json'].includes(fileType)) {
      return NextResponse.json({ error: 'fileType must be "csv" or "json"' }, { status: 400 });
    }

    if (!['skip', 'fail', 'upsert'].includes(conflictMode)) {
      return NextResponse.json({ error: 'conflictMode must be "skip", "fail", or "upsert"' }, { status: 400 });
    }

    const schema = TABLE_SCHEMAS[table];
    let rows;
    try {
      rows = parseFileContent(fileContent, fileType);
    } catch (err) {
      return NextResponse.json({ error: `File parse error: ${err.message}` }, { status: 400 });
    }

    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `File contains ${rows.length} rows. Maximum allowed is ${MAX_ROWS}.` },
        { status: 400 }
      );
    }

    const fileColumns = Object.keys(rows[0] || {});

    if (action === 'preview') {
      // Auto-map columns where file header matches a DB column name
      const autoMapping = {};
      for (const fileCol of fileColumns) {
        if (schema.columns[fileCol]) {
          autoMapping[fileCol] = fileCol;
        } else {
          autoMapping[fileCol] = '__skip__';
        }
      }

      const previewRows = rows.slice(0, 10);
      const token = computePreviewToken(table, conflictMode, rows);

      logAudit(db, {
        event: 'import.previewed',
        userEmail: auth.user.email,
        targetType: table,
        payload: { fileType, rowCount: rows.length, conflictMode },
      });

      return NextResponse.json({
        success: true,
        fileColumns,
        dbColumns: Object.entries(schema.columns).map(([name, def]) => ({
          name,
          type: def.type,
          required: !!def.required,
        })),
        autoMapping,
        previewRows,
        totalRows: rows.length,
        previewToken: token,
      });
    }

    // action === 'execute'
    if (!columnMapping || typeof columnMapping !== 'object') {
      return NextResponse.json({ error: 'columnMapping is required for execute' }, { status: 400 });
    }

    // Verify preview token matches
    const expectedToken = computePreviewToken(table, conflictMode, rows);
    if (body.previewToken !== expectedToken) {
      return NextResponse.json(
        { error: 'Preview token mismatch. The file or settings changed since preview. Please re-preview.' },
        { status: 409 }
      );
    }

    // Validate all rows
    const validRows = [];
    const allErrors = [];

    for (let i = 0; i < rows.length; i++) {
      const { mapped, errors } = validateRow(rows[i], schema, columnMapping, db, i);
      if (errors.length > 0) {
        allErrors.push(...errors);
        if (conflictMode === 'fail' && errors.length > 0) {
          return NextResponse.json({
            success: false,
            error: 'Validation failed',
            validationErrors: allErrors,
            inserted: 0,
            skipped: 0,
            errors: allErrors.length,
          }, { status: 400 });
        }
      } else {
        validRows.push(mapped);
      }
    }

    // Insert
    let insertResult;
    try {
      insertResult = insertRows(db, table, schema, validRows, conflictMode);
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: `Insert failed: ${err.message}`,
        inserted: 0,
        skipped: 0,
        errors: 1,
      }, { status: 500 });
    }

    logAudit(db, {
      event: 'import.executed',
      userEmail: auth.user.email,
      targetType: table,
      payload: {
        fileType,
        conflictMode,
        totalRows: rows.length,
        inserted: insertResult.inserted,
        updated: insertResult.updated,
        skipped: insertResult.skipped + allErrors.length,
        errors: insertResult.errors.length + allErrors.length,
      },
    });

    return NextResponse.json({
      success: true,
      totalRows: rows.length,
      inserted: insertResult.inserted,
      updated: insertResult.updated,
      skipped: insertResult.skipped + allErrors.length,
      validationErrors: [...allErrors, ...insertResult.errors],
    });
  } catch (error) {
    console.error('/api/admin/import POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

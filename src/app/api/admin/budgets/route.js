'use server';

import { NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/container/service-container';
import { requirePermission } from '@/lib/auth/server-auth';

function parsePositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parsePositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return null;
  const integer = Math.trunc(parsed);
  return integer > 0 ? integer : null;
}

function getBudgetSelectSql() {
  return `
    SELECT
      b.budget_id,
      b.initiative_id,
      i.initiative_name,
      b.fiscal_year,
      b.department,
      b.personnel,
      b.equipment,
      b.operations,
      b.travel,
      b.created_at,
      b.updated_at
    FROM initiative_budget b
    JOIN initiative i ON b.initiative_id = i.initiative_id
  `;
}

export async function GET(request) {
  try {
    const { db } = getServiceContainer();
    const auth = requirePermission(request, db, 'budgets.manage', { requireCsrf: false });
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const historyFor = parsePositiveInteger(url.searchParams.get('history_for'));
    const initiativeId = parsePositiveInteger(url.searchParams.get('initiative_id'));
    const fiscalYear = parsePositiveInteger(url.searchParams.get('fiscal_year'));
    const department = String(url.searchParams.get('department') || '').trim();

    if (historyFor) {
      const historyRows = db.prepare(`
        SELECT
          h.history_id,
          h.budget_id,
          h.initiative_id,
          i.initiative_name,
          h.fiscal_year,
          h.department,
          h.personnel,
          h.equipment,
          h.operations,
          h.travel,
          h.changed_by_user_id,
          u.email AS changed_by_email,
          h.created_at
        FROM initiative_budget_history h
        LEFT JOIN user u ON h.changed_by_user_id = u.user_id
        LEFT JOIN initiative i ON h.initiative_id = i.initiative_id
        WHERE h.budget_id = ?
        ORDER BY h.created_at DESC
      `).all(historyFor);

      return NextResponse.json({ success: true, history: historyRows });
    }

    const where = [];
    const binds = [];

    if (initiativeId) {
      where.push('b.initiative_id = ?');
      binds.push(initiativeId);
    }

    if (fiscalYear) {
      where.push('b.fiscal_year = ?');
      binds.push(fiscalYear);
    }

    if (department) {
      where.push('LOWER(b.department) = LOWER(?)');
      binds.push(department);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db.prepare(`${getBudgetSelectSql()} ${whereSql} ORDER BY b.fiscal_year DESC, b.department, i.initiative_name`).all(...binds);

    return NextResponse.json({ success: true, budgets: rows });
  } catch (error) {
    console.error('/api/admin/budgets GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch budgets' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { db } = getServiceContainer();
    const auth = requirePermission(request, db, 'budgets.manage');
    if (auth.error) return auth.error;

    const body = await request.json();
    const initiativeId = parsePositiveInteger(body.initiativeId);
    const fiscalYear = parsePositiveInteger(body.fiscalYear);
    const department = String(body.department || '').trim() || 'General';
    const personnel = parsePositiveNumber(body.personnel);
    const equipment = parsePositiveNumber(body.equipment);
    const operations = parsePositiveNumber(body.operations);
    const travel = parsePositiveNumber(body.travel);

    if (!initiativeId) {
      return NextResponse.json({ error: 'initiativeId is required' }, { status: 400 });
    }
    if (!fiscalYear) {
      return NextResponse.json({ error: 'fiscalYear is required' }, { status: 400 });
    }
    if (personnel === null || equipment === null || operations === null || travel === null) {
      return NextResponse.json({ error: 'All budget amounts must be non-negative numbers' }, { status: 400 });
    }

    try {
      const result = db.prepare(`
        INSERT INTO initiative_budget (
          initiative_id,
          fiscal_year,
          department,
          personnel,
          equipment,
          operations,
          travel
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(initiativeId, fiscalYear, department, personnel, equipment, operations, travel);

      const budgetId = result.lastInsertRowid;
      db.prepare(`
        INSERT INTO initiative_budget_history (
          budget_id,
          initiative_id,
          fiscal_year,
          department,
          personnel,
          equipment,
          operations,
          travel,
          changed_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(budgetId, initiativeId, fiscalYear, department, personnel, equipment, operations, travel, auth.user.user_id);

      const row = db.prepare(`${getBudgetSelectSql()} WHERE b.budget_id = ?`).get(budgetId);
      return NextResponse.json({ success: true, budget: row });
    } catch (error) {
      if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE' || error?.code === '23505' || String(error.message).includes('UNIQUE constraint failed')) {
        return NextResponse.json({ error: 'A budget already exists for this initiative and fiscal year' }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    console.error('/api/admin/budgets POST error:', error);
    return NextResponse.json({ error: 'Failed to create budget' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const { db } = getServiceContainer();
    const auth = requirePermission(request, db, 'budgets.manage');
    if (auth.error) return auth.error;

    const body = await request.json();
    const budgetId = parsePositiveInteger(body.budgetId);
    const initiativeId = parsePositiveInteger(body.initiativeId);
    const fiscalYear = parsePositiveInteger(body.fiscalYear);
    const department = String(body.department || '').trim() || 'General';
    const personnel = parsePositiveNumber(body.personnel);
    const equipment = parsePositiveNumber(body.equipment);
    const operations = parsePositiveNumber(body.operations);
    const travel = parsePositiveNumber(body.travel);

    if (!budgetId) {
      return NextResponse.json({ error: 'budgetId is required' }, { status: 400 });
    }
    if (!initiativeId) {
      return NextResponse.json({ error: 'initiativeId is required' }, { status: 400 });
    }
    if (!fiscalYear) {
      return NextResponse.json({ error: 'fiscalYear is required' }, { status: 400 });
    }
    if (personnel === null || equipment === null || operations === null || travel === null) {
      return NextResponse.json({ error: 'All budget amounts must be non-negative numbers' }, { status: 400 });
    }

    const existing = db.prepare('SELECT * FROM initiative_budget WHERE budget_id = ?').get(budgetId);
    if (!existing) {
      return NextResponse.json({ error: 'Budget not found' }, { status: 404 });
    }

    try {
      db.prepare(`
        UPDATE initiative_budget
        SET initiative_id = ?,
            fiscal_year = ?,
            department = ?,
            personnel = ?,
            equipment = ?,
            operations = ?,
            travel = ?,
            updated_at = datetime('now')
        WHERE budget_id = ?
      `).run(initiativeId, fiscalYear, department, personnel, equipment, operations, travel, budgetId);

      db.prepare(`
        INSERT INTO initiative_budget_history (
          budget_id,
          initiative_id,
          fiscal_year,
          department,
          personnel,
          equipment,
          operations,
          travel,
          changed_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(budgetId, initiativeId, fiscalYear, department, personnel, equipment, operations, travel, auth.user.user_id);

      const row = db.prepare(`${getBudgetSelectSql()} WHERE b.budget_id = ?`).get(budgetId);
      return NextResponse.json({ success: true, budget: row });
    } catch (error) {
      if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE' || error?.code === '23505' || String(error.message).includes('UNIQUE constraint failed')) {
        return NextResponse.json({ error: 'A budget already exists for this initiative and fiscal year' }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    console.error('/api/admin/budgets PUT error:', error);
    return NextResponse.json({ error: 'Failed to update budget' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { db } = getServiceContainer();
    const auth = requirePermission(request, db, 'budgets.manage');
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const budgetId = parsePositiveInteger(url.searchParams.get('budget_id'));
    if (!budgetId) {
      return NextResponse.json({ error: 'budget_id is required' }, { status: 400 });
    }

    const existing = db.prepare('SELECT budget_id FROM initiative_budget WHERE budget_id = ?').get(budgetId);
    if (!existing) {
      return NextResponse.json({ error: 'Budget not found' }, { status: 404 });
    }

    db.prepare('DELETE FROM initiative_budget_history WHERE budget_id = ?').run(budgetId);
    db.prepare('DELETE FROM initiative_budget WHERE budget_id = ?').run(budgetId);

    return NextResponse.json({ success: true, budgetId });
  } catch (error) {
    console.error('/api/admin/budgets DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete budget' }, { status: 500 });
  }
}

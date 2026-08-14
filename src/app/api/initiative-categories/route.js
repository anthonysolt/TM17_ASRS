import { db, initializeDatabase } from '@/lib/db';
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/server-auth';

/**
 * GET /api/initiative-categories
 * Fetch all initiative-category relationships
 * Optional query params: initiative_id or category_id to filter
 */
export async function GET(request) {
  try {
    initializeDatabase();
    const auth = requirePermission(request, db, 'initiatives.manage', { requireCsrf: false });
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const initiativeId = searchParams.get('initiative_id');
    const categoryId = searchParams.get('category_id');

    let query = 'SELECT ic.*, i.initiative_name, c.category_name FROM initiative_category ic JOIN initiative i ON ic.initiative_id = i.initiative_id JOIN category c ON ic.category_id = c.category_id';
    const params = [];

    if (initiativeId) {
      query += ' WHERE ic.initiative_id = ?';
      params.push(initiativeId);
    } else if (categoryId) {
      query += ' WHERE ic.category_id = ?';
      params.push(categoryId);
    }

    query += ' ORDER BY ic.added_at DESC';

    const stmt = db.prepare(query);
    const relationships = params.length > 0 ? stmt.all(...params) : stmt.all();

    return NextResponse.json({
      success: true,
      relationships,
      total: relationships.length,
    });
  } catch (error) {
    console.error('Error fetching initiative-category relationships:', error);
    return NextResponse.json(
      { error: 'Failed to fetch relationships', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/initiative-categories
 * Link an initiative to a category
 * Body: { initiative_id: number, category_id: number }
 */
export async function POST(request) {
  try {
    initializeDatabase();
    const auth = requirePermission(request, db, 'initiatives.manage');
    if (auth.error) return auth.error;

    const body = await request.json();
    const { initiative_id, category_id } = body;

    if (!initiative_id || !category_id) {
      return NextResponse.json(
        { error: 'Missing required fields: initiative_id and category_id' },
        { status: 400 }
      );
    }

    // Verify initiative exists
    const initiative = db.prepare('SELECT initiative_id FROM initiative WHERE initiative_id = ?').get(initiative_id);
    if (!initiative) {
      return NextResponse.json(
        { error: 'Initiative not found' },
        { status: 404 }
      );
    }

    // Verify category exists
    const category = db.prepare('SELECT category_id FROM category WHERE category_id = ?').get(category_id);
    if (!category) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }

    // Insert the relationship
    const result = db.prepare(
      'INSERT INTO initiative_category (initiative_id, category_id) VALUES (?, ?)'
    ).run(initiative_id, category_id);

    return NextResponse.json(
      {
        success: true,
        message: 'Initiative added to category',
        initiative_category_id: result.lastInsertRowid,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === '23505') {
      return NextResponse.json(
        { error: 'Initiative is already assigned to this category' },
        { status: 409 }
      );
    }
    console.error('Error linking initiative to category:', error);
    return NextResponse.json(
      { error: 'Failed to link initiative to category', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/initiative-categories
 * Unlink an initiative from a category
 * Body: { initiative_id: number, category_id: number }
 */
export async function DELETE(request) {
  try {
    initializeDatabase();
    const auth = requirePermission(request, db, 'initiatives.manage');
    if (auth.error) return auth.error;

    const body = await request.json();
    const { initiative_id, category_id } = body;

    if (!initiative_id || !category_id) {
      return NextResponse.json(
        { error: 'Missing required fields: initiative_id and category_id' },
        { status: 400 }
      );
    }

    const result = db.prepare(
      'DELETE FROM initiative_category WHERE initiative_id = ? AND category_id = ?'
    ).run(initiative_id, category_id);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: 'Relationship not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Initiative removed from category',
    });
  } catch (error) {
    console.error('Error unlinking initiative from category:', error);
    return NextResponse.json(
      { error: 'Failed to unlink initiative from category', details: error.message },
      { status: 500 }
    );
  }
}

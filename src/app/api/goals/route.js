import { NextResponse } from 'next/server';
import db, { initializeDatabase } from '@/lib/db';
import { requirePermission } from '@/lib/auth/server-auth';
import { logAudit } from '@/lib/audit';
import { getServiceContainer } from '@/lib/container/service-container';
import EVENTS from '@/lib/events/event-types';
import {
  performGoalUpdate,
  ALLOWED_FIELDS,
  computeGoalScore,
} from '@/lib/goals/perform-goal-update';

function sameUpdatedAt(clientVal, serverVal) {
  return String(clientVal ?? '').trim() === String(serverVal ?? '').trim();
}

function isValidWeight(weight) {
  const numericWeight = Number(weight);
  const hundredths = numericWeight * 100;
  return Number.isFinite(numericWeight)
    && numericWeight >= 0
    && numericWeight <= 100
    && Math.abs(hundredths - Math.round(hundredths)) < 1e-8;
}

// Compute overall weighted score across all goals
function computeOverallScore(goals) {
  if (goals.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const goal of goals) {
    const score = computeGoalScore(goal);
    weightedSum += score * goal.weight;
    totalWeight += goal.weight;
  }

  if (totalWeight === 0) return 0;
  return parseFloat((weightedSum / totalWeight).toFixed(2));
}

// Calculate days until deadline
function getDaysUntilDeadline(deadline) {
  if (!deadline) return null;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const deadlineDate = new Date(deadline);
  deadlineDate.setHours(0, 0, 0, 0);
  
  const diffTime = deadlineDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

// GET - Fetch goals for an initiative with computed scores
export async function GET(request) {
  try {
    initializeDatabase();
    const auth = requirePermission(request, db, 'goals.manage');
    if (auth.error) return auth.error;
    const { searchParams } = new URL(request.url);
    const initiativeId = searchParams.get('initiativeId');

    if (!initiativeId) {
      return NextResponse.json(
        { error: 'Missing required parameter: initiativeId' },
        { status: 400 }
      );
    }

    const goals = db.prepare(`
      SELECT g.*, i.initiative_name
      FROM initiative_goal g
      JOIN initiative i ON g.initiative_id = i.initiative_id
      WHERE g.initiative_id = ?
      ORDER BY g.created_at ASC
    `).all(initiativeId);

    const goalsWithScores = goals.map((goal) => ({
      ...goal,
      score: parseFloat(computeGoalScore(goal).toFixed(2)),
      daysUntilDeadline: getDaysUntilDeadline(goal.deadline),
    }));

    const overallScore = computeOverallScore(goals);

    return NextResponse.json({
      goals: goalsWithScores,
      overallScore,
      initiativeId: parseInt(initiativeId),
    });
  } catch (error) {
    console.error('Error fetching goals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch goals', details: error.message },
      { status: 500 }
    );
  }
}

// POST - Create a new goal
export async function POST(request) {
  try {
    initializeDatabase();
    const auth = requirePermission(request, db, 'goals.manage');
    if (auth.error) return auth.error;

    const body = await request.json();
    const {
      initiative_id,
      goal_name,
      description,
      target_metric,
      target_value,
      current_value,
      weight,
      scoring_method,
      deadline,
    } = body;

    // Validate required fields
    if (!initiative_id || !goal_name || !target_metric || target_value == null || weight == null || weight === '' || !scoring_method) {
      return NextResponse.json(
        { error: 'Missing required fields: initiative_id, goal_name, target_metric, target_value, weight, scoring_method' },
        { status: 400 }
      );
    }

    // Validate scoring_method value
    if (!['linear', 'threshold', 'binary'].includes(scoring_method)) {
      return NextResponse.json(
        { error: 'Invalid scoring_method. Must be: linear, threshold, or binary' },
        { status: 400 }
      );
    }

    // Weight must stay within the percentage range.
    if (!isValidWeight(weight)) {
      return NextResponse.json(
        { error: 'Weight must be between 0 and 100 with no more than two decimal places' },
        { status: 400 }
      );
    }

    // Verify initiative exists
    const initiative = db.prepare(
      'SELECT initiative_id FROM initiative WHERE initiative_id = ?'
    ).get(initiative_id);

    if (!initiative) {
      return NextResponse.json(
        { error: 'Initiative not found' },
        { status: 404 }
      );
    }

    const result = db.prepare(`
      INSERT INTO initiative_goal (initiative_id, goal_name, description, target_metric, target_value, current_value, weight, scoring_method, deadline)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      initiative_id,
      goal_name.trim(),
      (description || '').trim(),
      target_metric.trim(),
      target_value,
      current_value || 0,
      weight,
      scoring_method,
      deadline || null
    );

    const newGoal = db.prepare('SELECT * FROM initiative_goal WHERE goal_id = ?').get(result.lastInsertRowid);

    // Record initial progress snapshot
    db.prepare(`
      INSERT INTO goal_progress_history (goal_id, initiative_id, recorded_value, target_value, score)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      newGoal.goal_id,
      newGoal.initiative_id,
      newGoal.current_value,
      newGoal.target_value,
      parseFloat(computeGoalScore(newGoal).toFixed(2))
    );

    // ── Audit log ──
    logAudit(db, {
      event: 'goal.created',
      userEmail: auth.user.email,
      targetType: 'goal',
      targetId: String(newGoal.goal_id),
      payload: {
        initiative_id,
        goal_name: goal_name.trim(),
        target_metric: target_metric.trim(),
        target_value,
        scoring_method,
        deadline: deadline || null,
      },
    });

    return NextResponse.json({
      success: true,
      adjustedGoals: result.adjustedGoals,
      goal: {
        ...newGoal,
        score: parseFloat(computeGoalScore(newGoal).toFixed(2)),
        daysUntilDeadline: getDaysUntilDeadline(newGoal.deadline),
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating goal:', error);
    return NextResponse.json(
      { error: 'Failed to create goal', details: error.message },
      { status: 500 }
    );
  }
}

// PUT - Update an existing goal
export async function PUT(request) {
  try {
    initializeDatabase();
    const auth = requirePermission(request, db, 'goals.manage');
    if (auth.error) return auth.error;

    const body = await request.json();
    const { goal_id, expected_updated_at, ...updates } = body;

    if (!goal_id) {
      return NextResponse.json(
        { error: 'Missing required field: goal_id' },
        { status: 400 }
      );
    }

    // Verify goal exists
    const existing = db.prepare('SELECT * FROM initiative_goal WHERE goal_id = ?').get(goal_id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Goal not found' },
        { status: 404 }
      );
    }

    const proposedPatch = {};
    for (const field of ALLOWED_FIELDS) {
      if (updates[field] !== undefined) proposedPatch[field] = updates[field];
    }

    if (Object.keys(proposedPatch).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const hasVersion = expected_updated_at != null && String(expected_updated_at).trim() !== '';
    if (hasVersion && !sameUpdatedAt(expected_updated_at, existing.updated_at)) {
      const serverSnapshot = {};
      for (const field of ALLOWED_FIELDS) {
        serverSnapshot[field] = existing[field];
      }
      serverSnapshot.updated_at = existing.updated_at;

      const ins = db
        .prepare(`
        INSERT INTO goal_edit_conflict (
          goal_id, initiative_id, status,
          expected_updated_at, detected_server_updated_at,
          proposed_patch, server_snapshot, submitter_email
        ) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?)
      `)
        .run(
          goal_id,
          existing.initiative_id,
          String(expected_updated_at).trim(),
          String(existing.updated_at).trim(),
          JSON.stringify(proposedPatch),
          JSON.stringify(serverSnapshot),
          auth.user.email
        );

      const conflictId = Number(ins.lastInsertRowid);
      const { eventBus } = getServiceContainer();
      eventBus.publish(EVENTS.GOAL_EDIT_CONFLICT, {
        conflictId,
        goalId: Number(goal_id),
        initiativeId: existing.initiative_id,
        submitterEmail: auth.user.email,
        goalName: existing.goal_name,
        notifiedAt: new Date().toISOString(),
      });

      logAudit(db, {
        event: 'goal.conflict_detected',
        userEmail: auth.user.email,
        targetType: 'goal',
        targetId: String(goal_id),
        payload: {
          conflict_id: conflictId,
          initiative_id: existing.initiative_id,
          expected_updated_at,
          server_updated_at: existing.updated_at,
          proposed_fields: Object.keys(proposedPatch),
        },
      });

      const serverGoal = db.prepare('SELECT * FROM initiative_goal WHERE goal_id = ?').get(goal_id);
      return NextResponse.json(
        {
          error: 'This goal was modified by someone else. Your changes were not saved. An administrator has been notified to review the conflict.',
          conflict: true,
          conflict_id: conflictId,
          goal: {
            ...serverGoal,
            score: parseFloat(computeGoalScore(serverGoal).toFixed(2)),
            daysUntilDeadline: getDaysUntilDeadline(serverGoal.deadline),
          },
        },
        { status: 409 }
      );
    }

    const result = performGoalUpdate(db, existing, proposedPatch, { userEmail: auth.user.email });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const updatedGoal = result.goal;
    return NextResponse.json({
      success: true,
      goal: {
        ...updatedGoal,
        score: parseFloat(computeGoalScore(updatedGoal).toFixed(2)),
        daysUntilDeadline: getDaysUntilDeadline(updatedGoal.deadline),
      },
    });
  } catch (error) {
    console.error('Error updating goal:', error);
    return NextResponse.json(
      { error: 'Failed to update goal', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Remove a goal
export async function DELETE(request) {
  try {
    initializeDatabase();
    const auth = requirePermission(request, db, 'goals.manage');
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const goalId = searchParams.get('goalId');

    if (!goalId) {
      return NextResponse.json(
        { error: 'Missing required parameter: goalId' },
        { status: 400 }
      );
    }

    const existing = db.prepare('SELECT * FROM initiative_goal WHERE goal_id = ?').get(goalId);
    if (!existing) {
      return NextResponse.json(
        { error: 'Goal not found' },
        { status: 404 }
      );
    }

    db.prepare('DELETE FROM initiative_goal WHERE goal_id = ?').run(goalId);

    // ── Audit log ──
    logAudit(db, {
      event: 'goal.deleted',
      userEmail: auth.user.email,
      targetType: 'goal',
      targetId: String(goalId),
      payload: {
        goal_name: existing.goal_name,
        initiative_id: existing.initiative_id,
        target_metric: existing.target_metric,
        target_value: existing.target_value,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Goal ${goalId} deleted`,
    });
  } catch (error) {
    console.error('Error deleting goal:', error);
    return NextResponse.json(
      { error: 'Failed to delete goal', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * ============================================================================
 * AUDIT LOG HELPER — Insert audit trail entries from any API route.
 * ============================================================================
 *
 * Usage (inside an API handler):
 *
 *   import { logAudit } from '@/lib/audit';
 *
 *   logAudit(db, {
 *     event:       'goal.created',
 *     userEmail:   auth.user.email,
 *     targetType:  'goal',
 *     targetId:    String(newGoal.goal_id),
 *     payload:     { goal_name, initiative_id, target_value },
 *   });
 *
 * The `payload` object is stored as a JSON string so the front-end can render
 * a human-readable diff / summary later.
 *
 * Event naming convention:  <entity>.<action>
 *   e.g.  goal.created, goal.updated, goal.deleted,
 *         initiative.created, report.generated, survey.published,
 *         performance.updated, user.role_changed
 * ============================================================================
 */

/**
 * @param {{ prepare(sql: string): { run(...values: unknown[]): unknown } }} db
 * @param {{
 *   event:       string,
 *   userEmail:   string,
 *   targetType?: string,
 *   targetId?:   string,
 *   reasonType?: string,
 *   reasonText?: string,
 *   payload?:    Record<string, unknown>,
 * }} entry
 */
export function logAudit(db, entry) {
  try {
    db.prepare(`
      INSERT INTO audit_log (event, user_email, target_type, target_id, reason_type, reason_text, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.event,
      entry.userEmail ?? null,
      entry.targetType ?? null,
      entry.targetId != null ? String(entry.targetId) : null,
      entry.reasonType ?? null,
      entry.reasonText ?? null,
      entry.payload ? JSON.stringify(entry.payload) : null,
    );
  } catch (err) {
    // Audit logging should never break the primary operation.
    console.error('[audit] Failed to write audit log entry:', err.message);
  }
}

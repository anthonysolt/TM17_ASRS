import {
  buildNotificationsFeed,
  countUnreadNotifications,
  getReadTimestampForOpenedNotifications,
} from '@/lib/notifications';

describe('notifications helpers', () => {
  test('marks all currently fetched notifications as read using the latest notification timestamp', () => {
    const notifications = [
      { id: 'a', timestamp: '2026-04-11T15:00:00.000Z' },
      { id: 'b', timestamp: '2026-04-11T15:05:00.000Z' },
    ];

    const readTimestamp = getReadTimestampForOpenedNotifications(notifications, '2026-04-11T14:59:00.000Z');

    expect(readTimestamp).toBe('2026-04-11T15:05:00.000Z');
    expect(countUnreadNotifications(notifications, readTimestamp)).toBe(0);
  });

  test('returns only the five allowed lifecycle notification types', () => {
    const notifications = buildNotificationsFeed({
      activity: [
        { audit_id: 1, event: 'survey.submitted', payload: '{}', created_at: '2026-04-11T12:00:00.000Z' },
        { audit_id: 2, event: 'report.created', payload: '{"name":"Annual Report"}', created_at: '2026-04-11T11:00:00.000Z' },
        { audit_id: 3, event: 'report.deleted', payload: { name: 'Old Report' }, created_at: '2026-04-11T10:00:00.000Z' },
        { audit_id: 4, event: 'form.created', payload: '{"title":"Student Survey"}', created_at: '2026-04-11T09:00:00.000Z' },
        { audit_id: 5, event: 'form.deleted', payload: '{"title":"Old Form"}', created_at: '2026-04-11T08:00:00.000Z' },
        { audit_id: 6, event: 'goal.met', payload: '{"goal_name":"Reach 100 students"}', created_at: '2026-04-11T07:00:00.000Z' },
      ],
    });

    expect(notifications.map(notification => notification.title)).toEqual([
      'Report Created', 'Report Deleted', 'Form Created', 'Form Deleted', 'Goal Met',
    ]);
  });
});

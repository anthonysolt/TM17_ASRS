function notificationSort(left, right) {
  if (!left.timestamp && !right.timestamp) return 0;
  if (!left.timestamp) return 1;
  if (!right.timestamp) return -1;
  return new Date(right.timestamp) - new Date(left.timestamp);
}

export function getReadTimestampForOpenedNotifications(notifications, fallbackTimestamp = null) {
  const timestamps = notifications
    .map((notification) => notification.timestamp)
    .filter(Boolean)
    .sort((left, right) => new Date(right) - new Date(left));

  return timestamps[0] || fallbackTimestamp;
}

export function countUnreadNotifications(notifications, lastCheckedAt) {
  if (!lastCheckedAt) return notifications.length;
  const lastCheckedMs = new Date(lastCheckedAt).getTime();

  return notifications.filter((notification) => {
    if (!notification.timestamp) return false;
    return new Date(notification.timestamp).getTime() > lastCheckedMs;
  }).length;
}

export function buildNotificationsFeed({
  activity = [],
}) {
  const definitions = {
    'report.created': { type: 'report', title: 'Report Created', fallback: 'Untitled report', keys: ['name'] },
    'report.deleted': { type: 'report', title: 'Report Deleted', fallback: 'Untitled report', keys: ['name'] },
    'form.created': { type: 'form', title: 'Form Created', fallback: 'Untitled form', keys: ['title'] },
    'form.deleted': { type: 'form', title: 'Form Deleted', fallback: 'Untitled form', keys: ['title'] },
    'goal.met': { type: 'goal', title: 'Goal Met', fallback: 'Goal target reached', keys: ['goal_name'] },
  };

  return activity.flatMap(entry => {
    const definition = definitions[entry.event];
    if (!definition) return [];
    let payload = entry.payload || {};
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch { payload = {}; }
    }
    const description = definition.keys.map(key => payload?.[key]).find(Boolean) || definition.fallback;
    return [{
      id: `activity-${entry.audit_id}`,
      type: definition.type,
      title: definition.title,
      description,
      timestamp: entry.created_at,
    }];
  }).sort(notificationSort);
}

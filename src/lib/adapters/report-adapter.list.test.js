import { toReportDetailDto, toReportListItemDto } from '@/lib/adapters/report-adapter';

const row = {
  id: '4', initiative_id: '2', initiative_name: 'Youth', name: 'Q1', description: 'd', status: 'published',
  created_by: 'staff', display_order: '1', created_at: '2026-01-01', published_at: '2026-01-02',
  report_data: JSON.stringify({ version: 2, results: { summary: { totalParticipants: 3 } } }),
};

describe('report-adapter list vs detail', () => {
  test('list items leave out the saved snapshot', () => {
    const item = toReportListItemDto(row);
    expect(item).toEqual({
      id: 4, initiative_id: 2, initiative_name: 'Youth', name: 'Q1', description: 'd', status: 'published',
      created_by: 'staff', display_order: 1, created_at: '2026-01-01', published_at: '2026-01-02',
    });
    expect(item).not.toHaveProperty('report_data');
  });

  test('detail includes the snapshot as a string and parsed', () => {
    const detail = toReportDetailDto(row);
    expect(detail.report_data).toBe(row.report_data);
    expect(detail.report_snapshot.results.summary.totalParticipants).toBe(3);
  });
});

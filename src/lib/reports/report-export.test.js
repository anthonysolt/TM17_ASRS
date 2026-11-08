import { buildCsvLines, buildPdfHtml, escapeHtml, formatLabel } from '@/lib/reports/report-export';

describe('report-export', () => {
  test('buildCsvLines quotes values, escapes quotes and blanks nulls', () => {
    const lines = buildCsvLines([
      { Name: 'Ann "A"', Score: 5 },
      { Name: null, Score: 0 },
    ], []);
    expect(lines).toEqual([
      '"Name","Score"',
      '"Ann ""A""","5"',
      '"","0"',
    ]);
  });

  test('buildCsvLines with only goals has no leading blank line', () => {
    const goals = [{ goal_name: 'Attendance', weight: 50, target_value: 10, current_value: 5, score: 50 }];
    const lines = buildCsvLines([], goals);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).not.toBe('');
  });

  test('escapeHtml and formatLabel', () => {
    expect(escapeHtml(`<b>"x" & 'y'</b>`)).toBe('&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;');
    expect(escapeHtml({ a: 1 })).toBe('{&quot;a&quot;:1}');
    expect(formatLabel('averageRating_total')).toBe('Average Rating Total');
  });

  const target = {
    reportData: {
      summary: { totalParticipants: 2, averageRating: 4, completionRate: 100 },
      chartData: { Grade: [{ name: '7th', value: 2 }] },
      tableData: [{ Note: '<script>alert(1)</script>' }],
      goals: [],
      generatedDate: '2026-11-05',
    },
    trendData: [],
    initiative: { name: 'Youth <Mentoring>' },
    name: 'Q1',
  };

  test('buildPdfHtml escapes table cells and the initiative name', () => {
    const html = buildPdfHtml('Q1', target);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Youth &lt;Mentoring&gt;');
  });

  test('buildPdfHtml content option controls the charts and table sections', () => {
    const tableOnly = buildPdfHtml('Q1', target, { displayMode: 'table' });
    expect(tableOnly).toContain('<h2>Data Table</h2>');
    expect(tableOnly).not.toContain('<h2>Charts</h2>');

    const chartsOnly = buildPdfHtml('Q1', target, { displayMode: 'charts' });
    expect(chartsOnly).toContain('<h2>Charts</h2>');
    expect(chartsOnly).not.toContain('<h2>Data Table</h2>');
  });
});

import { STORED_ROW_LIMIT, capStoredRows } from '@/lib/reports/report-rows';

describe('capStoredRows', () => {
  test('keeps up to the limit and reports the total', () => {
    const rows = Array.from({ length: STORED_ROW_LIMIT + 3 }, (_, i) => ({ id: i }));
    const capped = capStoredRows(rows);
    expect(capped.rows).toHaveLength(STORED_ROW_LIMIT);
    expect(capped).toMatchObject({ totalRows: STORED_ROW_LIMIT + 3, truncated: true });
    expect(capStoredRows([{ id: 1 }])).toEqual({ rows: [{ id: 1 }], totalRows: 1, truncated: false });
  });
});

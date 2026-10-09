'use client';

import Link from 'next/link';
import { usePublicInitiatives } from '@/lib/use-public-initiatives';
import { getInitiativeReportsPath } from '@/lib/initiative-slug';

// Lists every initiative's public report page (/<initiative>_reports).
export default function InitiativeReportLinks() {
  const { initiatives, loading, error } = usePublicInitiatives();

  if (loading) {
    return <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>Loading initiatives…</p>;
  }
  if (error) {
    return <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>Unable to load initiatives right now.</p>;
  }
  if (initiatives.length === 0) {
    return <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>No initiatives available yet.</p>;
  }

  return (
    <ul
      aria-label="Initiative report pages"
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 12,
        width: '100%',
        textAlign: 'left',
      }}
    >
      {initiatives.map((initiative) => {
        const count = initiative.published_report_count ?? 0;
        return (
          <li key={initiative.id}>
            <Link
              href={getInitiativeReportsPath(initiative.name)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                height: '100%',
                boxSizing: 'border-box',
                padding: '14px 16px',
                border: '1px solid #E5E7EB',
                borderRadius: 10,
                backgroundColor: '#fff',
                color: '#111827',
                textDecoration: 'none',
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>{initiative.name}</span>
                <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: '#6B7280' }}>
                  {count === 1 ? '1 published report' : `${count} published reports`}
                </span>
              </span>
              <span aria-hidden="true" style={{ color: '#E67E22', fontWeight: 600 }}>→</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

'use client';

import Link from 'next/link';
import { getTabStyle, TAB_BAR_STYLE } from '@/components/TabBar';

const TABS = [
  { key: 'surveys', label: 'View Surveys', href: '/manage-surveys' },
  { key: 'distribution', label: 'Survey Distribution', href: '/survey-distribution' },
  { key: 'responses', label: 'Survey Responses', href: '/manage-surveys/responses' },
];

/**
 * Surveys header (same layout as the Reports page): title with a Create Survey
 * button, then a tab bar. Each tab is its own page, so the tabs are links.
 *
 * Props:
 * - activeTab: 'surveys' | 'distribution' | 'responses'
 * - showTabs: show the tab bar (default true); sub-pages like Generate QR Code hide it
 * - backHref, backLabel: optional back link shown just left of Create Survey
 * - showCreate: show the Create Survey button (default true)
 */
export default function SurveysPageHeader({ activeTab, showTabs = true, showCreate = true, backHref, backLabel = '\u2190 Back' }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Surveys</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {backHref && (
            <Link href={backHref} className="btn-outline" style={{ fontSize: '0.85rem' }}>
              {backLabel}
            </Link>
          )}
          {showCreate && (
            <Link href="/form-creation" className="btn-primary btn-create">
              Create Survey
            </Link>
          )}
        </div>
      </div>

      {showTabs && (
      <nav aria-label="Survey sections" style={TAB_BAR_STYLE}>
        {TABS.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              style={getTabStyle(active)}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      )}
    </>
  );
}

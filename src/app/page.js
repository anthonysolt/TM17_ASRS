'use client';

import PublicSiteHeader from '@/components/PublicSiteHeader';
import InitiativeReportLinks from '@/components/InitiativeReportLinks';
import { useAuthStore } from '@/lib/auth/use-auth-store';

/**
 * Public home page: published initiatives and reports, shown to everyone
 * whether or not they are logged in. The logged-in workspace is /dashboard.
 */
export default function PublicHomePage() {
  const { user, hydrated } = useAuthStore();
  const isLoggedIn = hydrated && Boolean(user);

  return (
    <div className="public-site-root">
      <PublicSiteHeader />
      <main className="public-site-hero">
        <h1 className="public-site-hero-title">ASRS Initiatives Reporting System</h1>
        <p className="public-site-hero-lede">
          {isLoggedIn
            ? 'Browse published reports for each initiative. Use Dashboard above to return to your workspace.'
            : 'Browse published reports for each initiative. Staff and administrators can log in above for the full workspace.'}
        </p>
        <div style={{ width: '100%', maxWidth: 720 }}>
          <InitiativeReportLinks />
        </div>
      </main>
    </div>
  );
}

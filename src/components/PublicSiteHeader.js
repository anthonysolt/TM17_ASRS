'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/use-auth-store';

/**
 * Shared top bar for the public pages (home + pages like /reporting).
 * Brand left, optional page title, then Home and either Log in or, for a
 * logged-in user viewing the public site, Dashboard.
 */
export default function PublicSiteHeader({ pageTitle = null }) {
  const pathname = usePathname();
  const { user, hydrated } = useAuthStore();
  const showHome = pathname !== '/';
  const isLoggedIn = hydrated && Boolean(user);

  return (
    <header className="public-site-header">
      <div className="public-site-header-inner">
        <Link href="/" className="public-site-brand" aria-label="ASRS home">
          <img src="/asrs-logo.png" alt="ASRS" width={36} height={36} className="public-site-brand-logo" />
          <span className="public-site-brand-text">ASRS</span>
          {pageTitle ? (
            <>
              <span className="public-site-header-sep" aria-hidden="true" />
              <span className="public-site-header-title">{pageTitle}</span>
            </>
          ) : null}
        </Link>
      </div>
      <div className="public-site-header-actions">
        {showHome ? (
          <Link href="/" className="public-site-header-link">
            Home
          </Link>
        ) : null}
        {isLoggedIn ? (
          <Link href="/dashboard" className="btn-outline public-site-header-login">
            Dashboard
          </Link>
        ) : (
          <Link href="/login" className="btn-outline public-site-header-login">
            Log in
          </Link>
        )}
      </div>
    </header>
  );
}

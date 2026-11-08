'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/use-auth-store';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import PublicSiteHeader from '@/components/PublicSiteHeader';

// publicShell: always use the public site header (no sidebar), even for logged-in
// users. Only applies to public pages (requireAuth={false}).
export default function PageLayout({ title, children, requireAuth = true, requireRole = null, publicShell = false }) {
  const router = useRouter();
  const { user, hydrated } = useAuthStore();

  const usePublicShell = !requireAuth && hydrated && (publicShell || !user);

  useEffect(() => {
    if (!hydrated || !requireAuth) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (requireRole && user.user_type !== requireRole) {
      router.push('/dashboard');
    }
  }, [hydrated, requireAuth, requireRole, router, user]);

  // Don't render anything until auth state is known
  if (!hydrated) return null;
  if (requireAuth && !user) return null;

  if (usePublicShell) {
    return (
      <div className="public-site-root">
        <PublicSiteHeader pageTitle={title} />
        <main className="public-site-main">
          <div className="public-site-content">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="main-content">
        <TopBar />
        <div className="content-area">
          {children}
        </div>
      </div>
    </div>
  );
}

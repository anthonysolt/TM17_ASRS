'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/use-auth-store';

/**
 * Renders children only for users with the surveys.distribute permission;
 * everyone else sees an "Access Restricted" card.
 */
export default function DistributionAccessGate({ children }) {
  const router = useRouter();
  const { user, hydrated, hasPermission } = useAuthStore();

  if (!hydrated) return null;
  if (user && hasPermission('surveys.distribute')) return children;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🔒</div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111827', marginBottom: '0.5rem' }}>
          Access Restricted
        </h2>
        <p style={{ color: '#6B7280', marginBottom: '1.5rem' }}>
          Only admin and staff users can distribute surveys. Please log in with an authorized account.
        </p>
        <button
          onClick={() => router.push('/login')}
          className="btn-primary"
          style={{ padding: '0.65rem 2rem', fontSize: '0.95rem' }}
        >
          Go to Login
        </button>
      </div>
    </div>
  );
}

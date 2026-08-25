'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth/use-auth-store';

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(() => {
    if (typeof window === 'undefined') return '';
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get('signup') === 'success'
      ? 'Account created successfully! Please log in.'
      : '';
  });


  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      const data = await response.json();

      if (response.ok) {
        setUser(data.user);
        setMessage(`Login successful! Welcome ${data.user.first_name}!`);
        setTimeout(() => {
          router.push('/');
        }, 1000);
      } else {
        setMessage(data.error || 'Login failed');
      }
    } catch {
      setMessage('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const isSuccess = message && !message.toLowerCase().includes('error') && !message.toLowerCase().includes('failed');

  return (
    <div style={{
      minHeight: '100vh', background: '#F9FAFB',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
    }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Login Card */}
        <div style={{
          background: '#fff', width: '100%',
          border: '1px solid #E5E7EB', borderRadius: 12, padding: 32, marginBottom: 20,
        }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <Link
              href="/"
              aria-label="Go to home"
              style={{ display: 'inline-block', marginBottom: 16, lineHeight: 0, borderRadius: 8 }}
            >
              <img src="/asrs-logo.png" alt="ASRS" style={{ width: 48, height: 48, borderRadius: 8, display: 'block' }} />
            </Link>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>ASRS Initiatives</h1>
            <p style={{ fontSize: 14, color: '#6B7280', marginTop: 4 }}>Reporting System</p>
          </div>

          {message && (
            <div style={{
              padding: '0.75rem', marginBottom: '1rem',
              backgroundColor: isSuccess ? '#e8f5e9' : '#ffebee',
              border: `1px solid ${isSuccess ? '#c8e6c9' : '#ffcdd2'}`,
              borderRadius: 8,
              color: isSuccess ? '#2e7d32' : '#c62828',
              fontSize: '0.9rem',
            }}>
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#111827', marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                style={{
                  width: '100%', padding: '10px 14px', fontSize: 15,
                  border: '1px solid #E5E7EB', borderRadius: 8, background: '#fff',
                  color: '#111827', outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={(e) => { e.target.style.borderColor = '#E67E22'; e.target.style.boxShadow = '0 0 0 3px rgba(230,126,34,.1)'; }}
                onBlur={(e) => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#111827', marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                required
                style={{
                  width: '100%', padding: '10px 14px', fontSize: 15,
                  border: '1px solid #E5E7EB', borderRadius: 8, background: '#fff',
                  color: '#111827', outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={(e) => { e.target.style.borderColor = '#E67E22'; e.target.style.boxShadow = '0 0 0 3px rgba(230,126,34,.1)'; }}
                onBlur={(e) => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                display: 'block', width: '100%', padding: 12, fontSize: 15, fontWeight: 600,
                color: '#fff', background: loading ? '#D1D5DB' : '#E67E22',
                border: 'none', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
                marginTop: 4,
              }}
              onMouseEnter={(e) => { if (!loading) e.target.style.background = '#D35400'; }}
              onMouseLeave={(e) => { if (!loading) e.target.style.background = '#E67E22'; }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div style={{ marginTop: 24, textAlign: 'center', fontSize: 14, color: '#6B7280' }}>
            Don&apos;t have an account?{' '}
            <Link href="/signup" style={{ color: '#E67E22', textDecoration: 'none', fontWeight: 600 }}>
              Sign up
            </Link>
          </div>

          <div style={{
            marginTop: 24, padding: '1rem',
            backgroundColor: '#f5f5f5', borderRadius: 8,
            fontSize: '0.85rem', lineHeight: '1.6',
          }}>
            <strong>Test Account:</strong>
            <div style={{ marginTop: '0.5rem' }}>
              <div style={testAccountCardStyle}>
                <div style={{ fontWeight: '600', color: '#c0392b', marginBottom: '0.25rem' }}>Admin</div>
                <div>Email: <code style={{ fontSize: '0.8rem' }}>admin@test.com</code></div>
                <div>Password: <code style={{ fontSize: '0.8rem' }}>temporary1!</code></div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

const testAccountCardStyle = {
  padding: '0.5rem 0.75rem',
  backgroundColor: 'white',
  borderRadius: '6px',
  border: '1px solid #e0e0e0',
};

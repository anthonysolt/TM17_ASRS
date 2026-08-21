'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth/use-auth-store';
import { apiFetch } from '@/lib/api/client';
import {
  countUnreadNotifications,
  getReadTimestampForOpenedNotifications,
} from '@/lib/notifications';

function timeAgo(timestamp) {
  if (!timestamp) return '';
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function NotificationIcon({ type }) {
  if (type === 'survey') {
    return (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#E67E22" strokeWidth="2">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
      </svg>
    );
  }
  if (type === 'report') {
    return (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#E67E22" strokeWidth="2">
        <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
      </svg>
    );
  }
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#E67E22" strokeWidth="2">
      <path d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
    </svg>
  );
}

export default function TopBar({ title }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('notifications_last_checked') || null;
    }
    return null;
  });

  const menuRef = useRef(null);
  const bellRef = useRef(null);
  const router = useRouter();
  const { user, clearUser } = useAuthStore();

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
    }
    if (menuOpen || showNotifications) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen, showNotifications]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await apiFetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchNotifications();
    }, 0);
    // Notification polling is temporarily disabled.
    // const interval = setInterval(fetchNotifications, 30000);
    return () => {
      clearTimeout(timeoutId);
      // clearInterval(interval);
    };
  }, [fetchNotifications]);

  const unreadCount = countUnreadNotifications(notifications, lastCheckedAt);

  function handleBellClick() {
    setShowNotifications(prev => {
      if (!prev) {
        const readTimestamp = getReadTimestampForOpenedNotifications(notifications, new Date().toISOString());
        setLastCheckedAt(readTimestamp);
        localStorage.setItem('notifications_last_checked', readTimestamp);
      }
      return !prev;
    });
  }

  const userInitials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  async function handleLogout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (e) { /* ignore */ }
    clearUser();
    localStorage.removeItem('user');
    router.push('/login');
  }

  return (
    <div className="topbar">
      <button
        onClick={() => {
          const sidebar = document.querySelector('.sidebar');
          sidebar?.classList.toggle('open');
        }}
        style={{
          display: 'none', background: 'none', border: 'none', cursor: 'pointer',
          padding: 4, color: '#6B7280',
        }}
        className="topbar-hamburger"
      >
        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
      </button>

      <div className="topbar-title">{title}</div>

      <div className="topbar-search">
        <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#9CA3AF' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input type="text" placeholder="Search initiatives, reports..." />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ position: 'relative' }} ref={bellRef}>
          <div
            style={{ position: 'relative', cursor: 'pointer', color: '#6B7280', display: 'flex' }}
            onClick={handleBellClick}
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
            </svg>
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -6,
                background: '#EF4444', color: '#fff',
                fontSize: 10, fontWeight: 700, lineHeight: '16px',
                minWidth: 16, height: 16, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px',
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>

          {showNotifications && (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 8px)',
              background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,.1)', width: 320, zIndex: 200,
              maxHeight: 400, overflowY: 'auto',
            }}>
              <div style={{
                padding: '12px 16px', borderBottom: '1px solid #F3F4F6',
                fontWeight: 600, fontSize: 14, color: '#111827',
              }}>
                Notifications
              </div>
              {notifications.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
                  No recent activity
                </div>
              ) : (
                notifications.map(n => (
                  <div key={n.id} style={{
                    padding: '10px 16px', borderBottom: '1px solid #F3F4F6',
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    cursor: 'default',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ marginTop: 2, flexShrink: 0 }}>
                      <NotificationIcon type={n.type} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{n.title}</div>
                      <div style={{
                        fontSize: 12, color: '#6B7280', marginTop: 2,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {n.description}
                      </div>
                      {n.timestamp && (
                        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>
                          {timeAgo(n.timestamp)}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }} ref={menuRef}>
          <div
            className="sidebar-user-avatar"
            style={{ width: 32, height: 32, fontSize: 12, cursor: 'pointer' }}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {userInitials}
          </div>
          {menuOpen && (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 8px)',
              background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,.1)', minWidth: 160, zIndex: 200,
              padding: '4px 0',
            }}>
              <Link href="/profile" onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '8px 16px', fontSize: 13, color: '#374151', textDecoration: 'none' }}>Profile</Link>
              <div style={{ borderTop: '1px solid #F3F4F6', margin: '4px 0' }} />
              <button onClick={handleLogout} style={{ display: 'block', width: '100%', padding: '8px 16px', fontSize: 13, color: '#EF4444', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}>Sign Out</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

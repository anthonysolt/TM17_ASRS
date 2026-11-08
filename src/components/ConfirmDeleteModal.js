"use client";

import { useState } from 'react';

/**
 * Second-step confirmation for destructive deletes. Shows a warning and only
 * enables the delete button once the user types the item's exact name.
 *
 * Props: open, onClose, onConfirm, itemName, title, warning, deleting
 */
export default function ConfirmDeleteModal({ open, ...props }) {
  // Mounting the dialog only while open resets the typed name each time.
  return open ? <ConfirmDeleteDialog {...props} /> : null;
}

function ConfirmDeleteDialog({ onClose, onConfirm, itemName, title, warning, deleting = false }) {
  const [typedName, setTypedName] = useState('');

  const matches = typedName.trim() === String(itemName || '').trim();
  const canDelete = matches && !deleting;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 8000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} onClick={deleting ? undefined : onClose} />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        style={{ position: 'relative', width: 'min(520px, 95%)', background: 'white', borderRadius: 10, padding: '1.25rem', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}
      >
        <h3 id="confirm-delete-title" style={{ margin: '0 0 0.75rem', color: '#991B1B' }}>{title}</h3>

        <div style={{
          padding: '0.75rem 0.9rem', marginBottom: '1rem', borderRadius: 8,
          backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: '0.88rem', lineHeight: 1.5,
        }}>
          <strong>Warning:</strong> {warning} This cannot be undone.
        </div>

        <label htmlFor="confirm-delete-name" style={{ display: 'block', fontSize: '0.85rem', color: '#374151', marginBottom: '0.35rem' }}>
          Type <strong>{itemName}</strong> to confirm:
        </label>
        <input
          id="confirm-delete-name"
          type="text"
          value={typedName}
          onChange={(event) => setTypedName(event.target.value)}
          autoComplete="off"
          autoFocus
          disabled={deleting}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.7rem', marginBottom: '1rem',
            borderRadius: 6, border: `1px solid ${matches ? '#DC2626' : '#D1D5DB'}`, fontSize: '0.9rem',
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            style={{ padding: '0.5rem 0.9rem', borderRadius: 6, background: '#efefef', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canDelete}
            style={{
              padding: '0.5rem 0.9rem', borderRadius: 6, border: 'none', color: 'white', fontWeight: 600,
              background: '#DC2626', opacity: canDelete ? 1 : 0.5, cursor: canDelete ? 'pointer' : 'not-allowed',
            }}
          >
            {deleting ? 'Deleting…' : 'Permanently Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import EntryCard, { InlineDeleteConfirm, entryButtonStyle } from '@/components/EntryCard';
import { getFormBuilderEditPath } from '@/lib/forms/form-editing-client';

function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * One survey template in a list, in the same layout as the Reports page
 * entries: Details / Edit / Preview, plus Delete when onDelete is given.
 *
 * Props: template, responseCount, onView(templateId)?, onDelete(templateId)?
 */
export default function SurveyCard({ template, responseCount, onView, onDelete }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const questionCount = template.questions?.length || 0;

  const preview = () => (onView
    ? onView(template.id)
    : window.location.assign(`/survey?template=${encodeURIComponent(template.id)}`));

  async function confirmDelete() {
    setDeleting(true);
    try {
      await onDelete(template.id);
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <EntryCard
      title={template.title}
      meta={[
        template.initiative_name,
        template.createdAt && `Created ${formatDate(template.createdAt)}`,
      ]}
      description={template.description}
      stats={[
        { label: 'Questions', value: questionCount },
        { label: 'Responses', value: responseCount },
      ]}
      statsUnderTitle
    >
      <Link href={`/manage-surveys/${template.id}`} style={entryButtonStyle}>Details</Link>
      <Link href={getFormBuilderEditPath(template.id)} style={entryButtonStyle}>Edit</Link>
      <button type="button" onClick={preview} style={entryButtonStyle}>Preview</button>
      {onDelete && (
        <InlineDeleteConfirm
          confirming={confirmingDelete}
          onStart={() => setConfirmingDelete(true)}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(false)}
          disabled={deleting}
          prompt="Delete survey and its responses?"
        />
      )}
    </EntryCard>
  );
}

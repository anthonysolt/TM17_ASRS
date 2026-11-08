'use client';

import { apiFetch } from '@/lib/api/client';
import PillSelect from '@/components/PillSelect';
import {
  INITIATIVE_STATUS_OPTIONS,
  INITIATIVE_VIEW_OPTIONS,
  getInitiativeStatusOption,
  getInitiativeViewOption,
} from '@/lib/initiative-status';

/**
 * Table cell control for an initiative's Status or View. Editors get a
 * pill-styled dropdown that saves immediately; everyone else sees the pill.
 *
 * Props:
 * - initiative: initiative DTO (needs id and settings)
 * - setting: 'status' | 'view'
 * - editable: whether the user may change it (initiatives.manage)
 * - onSaved(updatedInitiative): called with the saved initiative from the API
 */
export default function InitiativeSettingSelect({ initiative, setting, editable, onSaved }) {
  const isStatus = setting === 'status';
  const current = isStatus
    ? getInitiativeStatusOption(initiative.settings?.status ?? initiative.status)
    : getInitiativeViewOption(initiative.settings);
  const options = isStatus ? INITIATIVE_STATUS_OPTIONS : INITIATIVE_VIEW_OPTIONS;
  const label = isStatus ? 'Status' : 'View';

  async function save(next) {
    const patch = isStatus ? { status: next } : { isPublic: next === 'public' };
    try {
      const response = await apiFetch(`/api/initiatives/${initiative.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { ...(initiative.settings || {}), ...patch } }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Failed to update ${label.toLowerCase()}`);
      onSaved?.(data.initiative);
    } catch (error) {
      alert(error.message || 'Connection error. Please try again.');
    }
  }

  return (
    <PillSelect
      value={current.value}
      options={options}
      fallback={current}
      editable={editable}
      onChange={save}
      ariaLabel={`${label} for ${initiative.name}`}
      title={`Change ${label.toLowerCase()}`}
    />
  );
}

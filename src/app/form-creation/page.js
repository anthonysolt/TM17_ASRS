'use client';

import PageLayout from '@/components/PageLayout';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';

// Question type labels + icons
const QUESTION_TYPE_DEFS = [
  { type: 'text',       label: 'Short Text',    icon: '📝' },
  { type: 'textarea',   label: 'Long Text',     icon: '📄' },
  { type: 'number',     label: 'Number',        icon: '🔢' },
  { type: 'select',     label: 'Dropdown',      icon: '⌄' },
  { type: 'checkbox',   label: 'Checkbox',      icon: '☑' },
  { type: 'radio',      label: 'Multiple Choice', icon: '⊙' },
  { type: 'date',       label: 'Date',          icon: '📅' },
  { type: 'rating',     label: 'Rating',        icon: '★' },
  { type: 'email',      label: 'Email',         icon: '@' },
  { type: 'url',        label: 'URL / Link',    icon: '🔗' },
];

function attributeSupportsQuestion(attributeType, questionType, options = []) {
  const effectiveQuestionType = questionType === 'checkbox' && options.length > 0 ? 'multiselect' : questionType;
  const normalizedType = {
    textarea: 'text', email: 'text', url: 'text', select: 'text',
    multiselect: 'json', radio: 'text', choice: 'text', checkbox: 'boolean',
    rating: 'number', yesno: 'boolean',
  }[effectiveQuestionType] || effectiveQuestionType;
  return attributeType === normalizedType;
}

// Pre-built required fields that are automatically included in every form.
// These cannot be removed by the user.
const REQUIRED_FIELDS = [
  {
    field_id: 'required-full-name',
    field_key: 'full_name',
    field_label: 'Full Name',
    field_type: 'text',
    scope: 'common',
    required: true,
    validation_rules: { minLength: 2, maxLength: 100 },
    options: [],
    _locked: true,
  },
];

export default function FormCreationPage() {
  const [userRole, setUserRole] = useState('staff');
  const [initiatives, setInitiatives] = useState([]);
  const [fieldCatalog, setFieldCatalog] = useState({ common: [], initiative_specific: [], staff_only: [] });
  const [selectedInitiative, setSelectedInitiative] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [selectedFields, setSelectedFields] = useState([...REQUIRED_FIELDS]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [questionTab, setQuestionTab] = useState('types');
  const [initiativeAttributes, setInitiativeAttributes] = useState([]);
  const [removingSavedQuestionId, setRemovingSavedQuestionId] = useState(null);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/initiatives').then(r => r.json()),
      apiFetch('/api/admin/fields').then(r => {
        if (!r.ok) return { common: [], initiative_specific: [], staff_only: [] };
        return r.json();
      }),
    ]).then(([initData, fieldData]) => {
      setInitiatives(Array.isArray(initData) ? initData : initData.initiatives || []);
      setFieldCatalog(fieldData);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedInitiative) {
      setInitiativeAttributes([]);
      return;
    }
    let cancelled = false;
    apiFetch(`/api/initiative-attributes?initiativeId=${selectedInitiative}`)
      .then(response => response.ok ? response.json() : { attributes: [] })
      .then(data => { if (!cancelled) setInitiativeAttributes(data.attributes || []); })
      .catch(() => { if (!cancelled) setInitiativeAttributes([]); });
    return () => { cancelled = true; };
  }, [selectedInitiative]);

  const availableFields = [
    ...fieldCatalog.common.filter(f => f.is_reusable !== 0),
    ...fieldCatalog.initiative_specific.filter(f =>
      f.is_reusable !== 0 && (!selectedInitiative || f.initiative_id === Number(selectedInitiative))
    ),
  ];

  const addField = (field) => {
    if (selectedFields.some(sf => sf.field_id === field.field_id)) return;
    const reusableFieldType = field.validation_rules?.ui_type
      || ({ choice: 'radio', multiselect: 'checkbox', yesno: 'checkbox' }[field.field_type])
      || field.field_type;
    const needsOptions = ['select', 'radio', 'checkbox'].includes(reusableFieldType);
    const savedOptions = Array.isArray(field.options)
      ? field.options
      : (field.field_options || []).map(option => option.option_value);
    setSelectedFields([...selectedFields, {
      field_id: field.field_id,
      field_key: field.field_key,
      field_label: field.field_label,
      field_type: reusableFieldType,
      attribute_id: field.attribute_id || '',
      scope: field.scope,
      required: true,
      validation_rules: null,
      options: needsOptions ? (savedOptions.length > 0 ? savedOptions : ['Option 1', 'Option 2']) : [],
    }]);
  };

  const removeSavedQuestion = async (field, event) => {
    event.stopPropagation();
    if (removingSavedQuestionId !== null) return;
    setRemovingSavedQuestionId(field.field_id);
    try {
      const response = await apiFetch(`/api/admin/fields?fieldId=${field.field_id}`, {
        method: 'PATCH',
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Unable to remove saved question');
      }
      setFieldCatalog(current => ({
        ...current,
        common: current.common.filter(item => item.field_id !== field.field_id),
        initiative_specific: current.initiative_specific.filter(item => item.field_id !== field.field_id),
        staff_only: current.staff_only.filter(item => item.field_id !== field.field_id),
      }));
    } catch (error) {
      alert(error.message || 'Unable to remove saved question');
    } finally {
      setRemovingSavedQuestionId(null);
    }
  };

  const removeField = (fieldId) => {
    const field = selectedFields.find(f => f.field_id === fieldId);
    if (field?._locked) return; // Cannot remove pre-built required fields
    setSelectedFields(selectedFields.filter(f => f.field_id !== fieldId));
  };

  const updateFieldConfig = (fieldId, key, value) => {
    setSelectedFields(selectedFields.map(f => {
      // Prevent toggling required off on locked fields
      if (f.field_id === fieldId && key === 'required' && f._locked) return f;
      return f.field_id === fieldId ? { ...f, [key]: value } : f;
    }));
  };

  const moveField = (index, direction) => {
    const copy = [...selectedFields];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= copy.length) return;
    [copy[index], copy[newIndex]] = [copy[newIndex], copy[index]];
    setSelectedFields(copy);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formName.trim()) return alert('Please enter a form name');
    if (!selectedInitiative) return alert('Please select an initiative');
    if (selectedFields.length === 0) return alert('Please add at least one field');

    const customFields = selectedFields.filter(f => !f._locked);
    if (customFields.length === 0) return alert('Please add at least one custom question beyond the required information fields.');

    // Check for fields with empty labels
    const emptyLabel = selectedFields.find(f => !f._locked && !f.field_label.trim());
    if (emptyLabel) return alert('Please enter text for all questions before saving.');

    // Check for select/radio/checkbox fields with no options
    const emptyOptions = selectedFields.find(f => ['select', 'radio', 'checkbox'].includes(f.field_type) && (!f.options || f.options.length === 0 || f.options.every(o => !o.trim())));
    if (emptyOptions) return alert(`Please add options for "${emptyOptions.field_label || 'untitled question'}" before saving.`);

    setSaving(true);
    try {
      const payload = {
        title: formName,
        description: formDescription,
        initiative_id: Number(selectedInitiative),
        questions: selectedFields.map(f => {
          // Only send field_id for existing catalog fields (numeric IDs).
          // Synthetic fields (string IDs like 'synthetic-text-...') are new and should be created.
          const isSynthetic = typeof f.field_id === 'string' && f.field_id.startsWith('synthetic-');
          return {
            ...(isSynthetic ? {} : { field_id: f.field_id }),
            question: f.field_label,
            type: f.field_type,
            required: f.required,
            save_for_reuse: f.save_for_reuse === true,
            scope: f.scope,
            attribute_id: f.attribute_id || undefined,
            form_validation_rules: f.validation_rules || undefined,
            ...(f.options && f.options.length > 0 ? { options: f.options } : {}),
          };
        }),
      };

      const res = await apiFetch('/api/surveys/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Unknown error');
      alert('Form created successfully!');
      setFormName('');
      setFormDescription('');
      setSelectedFields([...REQUIRED_FIELDS]);
    } catch (err) {
      alert('Error: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageLayout title="Surveys">
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6B7280' }}>Loading...</div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Surveys">
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 }}>Form Builder</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="btn-outline"
            onClick={() => {
              if (selectedFields.length === 0) { alert('Add questions first to preview.'); return; }
              alert(`Preview: ${formName || 'Untitled Form'}\n${selectedFields.length} question(s)`);
            }}
          >
            Preview Form
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={saving}
            onClick={handleSubmit}
            style={{ opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Saving...' : 'Save Form'}
          </button>
        </div>
      </div>

      {/* Builder layout: 60/40 split */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* ── Left: Canvas (60%) ── */}
        <div style={{ flex: '3 1 400px', minWidth: 0 }}>

          {/* ── Required Information Section (locked) ── */}
          <div style={{
            backgroundColor: '#FEFCE8',
            border: '1px solid #FDE68A',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '14px' }}>🔒</span>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#92400E', margin: 0 }}>Required Information</h3>
              <span style={{ fontSize: '11px', color: '#92400E', backgroundColor: '#FEF3C7', padding: '2px 8px', borderRadius: '9999px', fontWeight: 600 }}>Auto-included</span>
            </div>
            {selectedFields.filter(f => f._locked).map((sf) => {
              const typeDef = QUESTION_TYPE_DEFS.find(t => t.type === sf.field_type) || { label: sf.field_type, icon: '?' };
              return (
                <div
                  key={sf.field_id}
                  style={{
                    backgroundColor: 'white',
                    border: '1px solid #E5E7EB',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', padding: '1px 6px', borderRadius: '9999px', backgroundColor: '#FFF7ED', color: '#E67E22', border: '1px solid #FED7AA' }}>
                        {typeDef.icon} {typeDef.label}
                      </span>
                      <span style={{ fontSize: '11px', color: '#DC2626', fontWeight: '600' }}>required</span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#111827' }}>{sf.field_label}</div>
                  </div>
                  <div style={{ height: '28px', flex: '0 0 180px', border: '1px solid #E5E7EB', borderRadius: '6px', backgroundColor: '#F9FAFB' }} />
                </div>
              );
            })}
          </div>

          {/* ── Custom Questions Section ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: 0 }}>Custom Questions</h3>
            <span style={{ fontSize: '11px', color: '#6B7280' }}>
              {selectedFields.filter(f => !f._locked).length} added
            </span>
          </div>

          {/* Empty state — only show when no custom questions added */}
          {selectedFields.every(f => f._locked) && (
            <div style={{
              border: '2px dashed #E5E7EB',
              borderRadius: '12px',
              padding: '24px',
              textAlign: 'center',
              color: '#9CA3AF',
              marginBottom: '16px',
            }}>
              <p style={{ fontWeight: '600', margin: '0 0 4px', fontSize: '13px' }}>Add custom questions from the palette on the right</p>
              <p style={{ fontSize: '12px', margin: 0 }}>Required information fields are already included above</p>
            </div>
          )}

          {/* Custom question blocks (non-locked only) */}
          {selectedFields.filter(f => !f._locked).map((sf) => {
            const idx = selectedFields.indexOf(sf);
            const typeDef = QUESTION_TYPE_DEFS.find(t => t.type === sf.field_type) || { label: sf.field_type, icon: '?' };
            return (
              <div
                key={sf.field_id}
                style={{
                  backgroundColor: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                }}
              >
                {/* Drag handle + order buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', paddingTop: '2px', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => moveField(idx, -1)}
                    disabled={idx === 0}
                    style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 0.6, fontSize: '14px', padding: '0', lineHeight: '1' }}
                  >▲</button>
                  <div style={{ color: '#D1D5DB', fontSize: '18px', lineHeight: '1', textAlign: 'center' }}>⠿</div>
                  <button
                    type="button"
                    onClick={() => moveField(idx, 1)}
                    disabled={idx === selectedFields.length - 1}
                    style={{ background: 'none', border: 'none', cursor: idx === selectedFields.length - 1 ? 'default' : 'pointer', opacity: idx === selectedFields.length - 1 ? 0.3 : 0.6, fontSize: '14px', padding: '0', lineHeight: '1' }}
                  >▼</button>
                </div>

                {/* Question content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', padding: '2px 8px', borderRadius: '9999px', backgroundColor: '#FFF7ED', color: '#E67E22', border: '1px solid #FED7AA' }}>
                      {typeDef.icon} {typeDef.label}
                    </span>
                    {sf.scope === 'initiative_specific' && (
                      <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '9999px', backgroundColor: '#EFF6FF', color: '#2563EB' }}>initiative</span>
                    )}
                    {sf.required && (
                      <span style={{ fontSize: '11px', color: '#DC2626', fontWeight: '600' }}>required</span>
                    )}
                  </div>

                  <input
                    value={sf.field_label}
                    onChange={e => updateFieldConfig(sf.field_id, 'field_label', e.target.value)}
                    placeholder="Enter question text..."
                    style={{
                      fontWeight: '600',
                      fontSize: '14px',
                      color: '#111827',
                      marginBottom: '6px',
                      width: '100%',
                      border: '1px solid transparent',
                      borderRadius: '6px',
                      padding: '4px 6px',
                      outline: 'none',
                      backgroundColor: 'transparent',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.15s, background-color 0.15s',
                    }}
                    onFocus={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.backgroundColor = '#F9FAFB'; }}
                    onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.backgroundColor = 'transparent'; }}
                  />

                  {/* Preview field */}
                  {(sf.field_type === 'text' || sf.field_type === 'email' || sf.field_type === 'url' || sf.field_type === 'number' || sf.field_type === 'date') && (
                    <div style={{ height: '32px', border: '1px solid #E5E7EB', borderRadius: '6px', backgroundColor: '#F9FAFB' }} />
                  )}
                  {sf.field_type === 'textarea' && (
                    <div style={{ height: '56px', border: '1px solid #E5E7EB', borderRadius: '6px', backgroundColor: '#F9FAFB' }} />
                  )}
                  {sf.field_type === 'rating' && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {[1,2,3,4,5].map(s => <span key={s} style={{ fontSize: '18px', color: '#D1D5DB' }}>★</span>)}
                    </div>
                  )}

                  {/* Options editor for select/radio/checkbox */}
                  {['select', 'radio', 'checkbox'].includes(sf.field_type) && (
                    <div style={{ marginTop: '8px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', marginBottom: '6px' }}>
                        Answer Options
                      </div>
                      {(sf.options || []).map((opt, optIdx) => (
                        <div key={optIdx} style={{ display: 'flex', gap: '6px', marginBottom: '4px', alignItems: 'center' }}>
                          <span style={{ color: '#D1D5DB', fontSize: '14px', flexShrink: 0 }}>
                            {sf.field_type === 'radio' ? '○' : sf.field_type === 'checkbox' ? '☐' : '•'}
                          </span>
                          <input
                            value={opt}
                            onChange={(e) => {
                              const newOpts = [...(sf.options || [])];
                              newOpts[optIdx] = e.target.value;
                              updateFieldConfig(sf.field_id, 'options', newOpts);
                            }}
                            style={{ flex: 1, padding: '4px 8px', borderRadius: '6px', border: '1px solid #E5E7EB', fontSize: '13px', outline: 'none' }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const newOpts = (sf.options || []).filter((_, i) => i !== optIdx);
                              updateFieldConfig(sf.field_id, 'options', newOpts);
                            }}
                            style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: '16px', padding: '0 2px' }}
                          >x</button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const newOpts = [...(sf.options || []), `Option ${(sf.options || []).length + 1}`];
                          updateFieldConfig(sf.field_id, 'options', newOpts);
                        }}
                        style={{ fontSize: '12px', color: '#E67E22', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontWeight: 500 }}
                      >+ Add Option</button>
                    </div>
                  )}

                  {/* Config row */}
                  <div style={{ display: 'flex', gap: '12px', marginTop: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#6B7280' }}>
                      Attribute
                      <select
                        value={sf.attribute_id || ''}
                        onChange={e => updateFieldConfig(sf.field_id, 'attribute_id', e.target.value ? Number(e.target.value) : '')}
                        aria-label={`Attribute for ${sf.field_label || 'question'}`}
                        style={{ minWidth: '150px', padding: '5px 8px', borderRadius: '6px', border: '1px solid #E5E7EB', fontSize: '12px', backgroundColor: '#fff' }}
                      >
                        <option value="">No attribute</option>
                        {initiativeAttributes
                          .filter(attribute => attributeSupportsQuestion(attribute.data_type, sf.field_type, sf.options))
                          .map(attribute => (
                            <option key={attribute.attribute_id} value={attribute.attribute_id}>
                              {attribute.name} ({attribute.data_type})
                            </option>
                          ))}
                      </select>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: sf.required ? '#DC2626' : '#6B7280', cursor: sf._locked ? 'not-allowed' : 'pointer', fontWeight: sf.required ? 600 : 400 }}>
                      <input
                        type="checkbox"
                        checked={sf.required}
                        onChange={e => updateFieldConfig(sf.field_id, 'required', e.target.checked)}
                        disabled={sf._locked}
                        style={{ accentColor: '#E67E22' }}
                      />
                      Required {sf._locked && '(locked)'}
                    </label>
                    {typeof sf.field_id === 'string' && sf.field_id.startsWith('synthetic-') && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#6B7280', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={sf.save_for_reuse === true}
                          onChange={e => updateFieldConfig(sf.field_id, 'save_for_reuse', e.target.checked)}
                          style={{ accentColor: '#E67E22' }}
                        />
                        Save question for reuse
                      </label>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removeField(sf.field_id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: '18px', padding: '0', flexShrink: 0 }}
                  title="Remove question"
                >×</button>
              </div>
            );
          })}

          {/* Add question prompt — always visible at bottom of canvas */}
          <div style={{
            border: '2px dashed #D1D5DB',
            borderRadius: '12px',
            padding: '20px 24px',
            textAlign: 'center',
            color: '#9CA3AF',
            cursor: 'default',
            marginBottom: '8px',
          }}>
            <span style={{ fontSize: '20px', display: 'block', marginBottom: '4px' }}>+</span>
            <span style={{ fontSize: '13px' }}>Choose a question type from the right to add it here</span>
          </div>
        </div>

        {/* ── Right: Palette (40%) ── */}
        <div style={{ flex: '2 1 280px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Form Settings — moved to top so users see it first */}
          <div className="card" style={{ padding: '20px' }}>
            <div className="card-header" style={{ marginBottom: '12px' }}>
              <span className="card-title">Form Settings</span>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                Initiative *
              </label>
              <select
                value={selectedInitiative}
                onChange={e => {
                  setSelectedInitiative(e.target.value);
                  setSelectedFields(fields => fields.map(field => ({ ...field, attribute_id: '' })));
                }}
                required
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '13px', color: '#111827', backgroundColor: 'white', outline: 'none' }}
              >
                <option value="">Select an initiative...</option>
                {initiatives.map(i => (
                  <option key={i.initiative_id || i.id} value={i.initiative_id || i.id}>
                    {i.initiative_name || i.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                Form Title *
              </label>
              <input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                required
                placeholder="e.g. Student Experience Survey"
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '13px', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                Description
              </label>
              <textarea
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="Brief description of this form..."
                rows={3}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '13px', color: '#111827', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>

            {selectedFields.length > 0 && (() => {
              const requiredCount = selectedFields.filter(f => f.required).length;
              const optionalCount = selectedFields.length - requiredCount;
              return (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #F3F4F6', fontSize: '12px' }}>
                  <div style={{ color: '#6B7280', marginBottom: optionalCount > 0 ? '8px' : 0 }}>
                    <strong style={{ color: '#111827' }}>{selectedFields.length}</strong> question{selectedFields.length !== 1 ? 's' : ''} &middot;{' '}
                    <span style={{ color: '#16A34A', fontWeight: 600 }}>{requiredCount} required</span>
                    {optionalCount > 0 && (
                      <span style={{ color: '#D97706', fontWeight: 600 }}> &middot; {optionalCount} optional</span>
                    )}
                  </div>
                  {optionalCount > 0 && (
                    <div style={{
                      padding: '6px 10px',
                      backgroundColor: '#FFFBEB',
                      border: '1px solid #FDE68A',
                      borderRadius: '6px',
                      color: '#92400E',
                      fontSize: '11px',
                      lineHeight: 1.4,
                    }}>
                      {optionalCount} field{optionalCount !== 1 ? 's are' : ' is'} optional. Users can skip {optionalCount !== 1 ? 'them' : 'it'} when filling out the survey.
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Add a Question — tabbed interface */}
          <div className="card" style={{ padding: '20px' }}>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid #E5E7EB', marginBottom: '12px' }}>
              <button
                type="button"
                onClick={() => setQuestionTab('types')}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: questionTab === 'types' ? '#E67E22' : '#6B7280',
                  background: 'none',
                  border: 'none',
                  borderBottom: questionTab === 'types' ? '2px solid #E67E22' : '2px solid transparent',
                  cursor: 'pointer',
                  marginBottom: '-1px',
                }}
              >Create Question</button>
              <button
                type="button"
                onClick={() => setQuestionTab('saved')}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: questionTab === 'saved' ? '#E67E22' : '#6B7280',
                  background: 'none',
                  border: 'none',
                  borderBottom: questionTab === 'saved' ? '2px solid #E67E22' : '2px solid transparent',
                  cursor: 'pointer',
                  marginBottom: '-1px',
                }}
              >Saved Questions</button>
            </div>

            {/* Create Question tab */}
            {questionTab === 'types' && (
              <>
                <p style={{ fontSize: '12px', color: '#9CA3AF', margin: '0 0 12px' }}>
                  Click a type below to add it to your form
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {QUESTION_TYPE_DEFS.map((t) => (
                    <button
                      key={t.type}
                      type="button"
                      onClick={() => {
                        const syntheticId = `synthetic-${t.type}-${Date.now()}`;
                        const needsOptions = ['select', 'radio', 'checkbox'].includes(t.type);
                        setSelectedFields(prev => [...prev, {
                          field_id: syntheticId,
                          field_key: t.type,
                          field_label: t.label,
                          field_type: t.type,
                          attribute_id: '',
                          scope: 'common',
                          required: true,
                          save_for_reuse: false,
                          validation_rules: null,
                          options: needsOptions ? ['Option 1', 'Option 2'] : [],
                        }]);
                      }}
                      style={{
                        padding: '10px 8px',
                        borderRadius: '8px',
                        border: '1px solid #E5E7EB',
                        backgroundColor: '#F9FAFB',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '500',
                        color: '#374151',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'background-color 0.15s, border-color 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FFF7ED'; e.currentTarget.style.borderColor = '#E67E22'; e.currentTarget.style.color = '#E67E22'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#F9FAFB'; e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.color = '#374151'; }}
                    >
                      <span>{t.icon}</span>
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Saved Questions tab */}
            {questionTab === 'saved' && (
              <>
                {availableFields.length > 0 ? (
                  <>
                    <p style={{ fontSize: '12px', color: '#9CA3AF', margin: '0 0 12px' }}>
                      Pre-configured questions from your organization. Click to add.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {availableFields.map(f => {
                        const isAdded = selectedFields.some(sf => sf.field_id === f.field_id);
                        return (
                          <div
                            key={f.field_id}
                            style={{
                              padding: '0 5px 0 12px',
                              borderRadius: '9999px',
                              border: `1px solid ${isAdded ? '#E5E7EB' : f.scope === 'common' ? '#BFDBFE' : '#FED7AA'}`,
                              backgroundColor: isAdded ? '#F3F4F6' : f.scope === 'common' ? '#EFF6FF' : '#FFF7ED',
                              color: isAdded ? '#9CA3AF' : f.scope === 'common' ? '#2563EB' : '#E67E22',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '2px',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => addField(f)}
                              disabled={isAdded}
                              style={{
                                padding: '6px 4px 6px 0', border: 'none', background: 'transparent',
                                color: 'inherit', fontSize: '12px', cursor: isAdded ? 'default' : 'pointer',
                                opacity: isAdded ? 0.6 : 1, fontWeight: 500,
                              }}
                            >
                              {isAdded && <span style={{ marginRight: '4px' }}>&#10003;</span>}
                              {f.field_label}
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove ${f.field_label} from saved questions`}
                              title="Remove from saved questions"
                              disabled={removingSavedQuestionId !== null}
                              onClick={(event) => removeSavedQuestion(f, event)}
                              style={{
                                width: '20px', height: '20px', padding: 0, border: 'none', borderRadius: '50%',
                                background: 'transparent', color: '#9CA3AF', cursor: 'pointer', fontSize: '15px',
                                lineHeight: 1, opacity: removingSavedQuestionId === f.field_id ? 0.4 : 1,
                              }}
                            >×</button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p style={{ fontSize: '13px', color: '#9CA3AF', textAlign: 'center', padding: '16px 0', margin: 0 }}>
                    No saved questions available
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

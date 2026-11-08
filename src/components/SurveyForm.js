"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api/client";

const SURVEY_FORM_DRAFT_KEY = "surveyTemplateDraft:v1";

export default function SurveyForm() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState([{ question: "", type: "text", options: [""], required: false }]);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const hasLoadedDraft = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const rawDraft = window.localStorage.getItem(SURVEY_FORM_DRAFT_KEY);
      if (!rawDraft) {
        hasLoadedDraft.current = true;
        return;
      }

      const parsedDraft = JSON.parse(rawDraft);
      if (parsedDraft && typeof parsedDraft === "object") {
        setTitle(typeof parsedDraft.title === "string" ? parsedDraft.title : "");
        setDescription(typeof parsedDraft.description === "string" ? parsedDraft.description : "");
        if (Array.isArray(parsedDraft.questions) && parsedDraft.questions.length > 0) {
          setQuestions(parsedDraft.questions);
        }
      }
    } catch {
      // Ignore invalid draft payloads and continue with empty form.
    } finally {
      hasLoadedDraft.current = true;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !hasLoadedDraft.current) return;

    const timeout = setTimeout(() => {
      const payload = {
        title,
        description,
        questions,
        savedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(SURVEY_FORM_DRAFT_KEY, JSON.stringify(payload));
    }, 600);

    return () => clearTimeout(timeout);
  }, [title, description, questions]);

  const addQuestion = () => setQuestions([...questions, { question: "", type: "text", options: [""], required: false }]);
  
  const updateQuestion = (idx, field, value) => {
    const copy = [...questions];
    copy[idx][field] = value;
    if (field === 'type' && value === 'select' && (!copy[idx].options || copy[idx].options.length === 0)) {
      copy[idx].options = [""];
    }
    if (field === 'type' && value === 'multiselect' && (!copy[idx].options || copy[idx].options.length === 0)) {
      copy[idx].options = [""];
    }
    setQuestions(copy);
  };
  
  const removeQuestion = (idx) => setQuestions(questions.filter((_, i) => i !== idx));
  const addOption = (qIdx) => {
    const copy = [...questions];
    if (!copy[qIdx].options) copy[qIdx].options = [];
    copy[qIdx].options.push("");
    setQuestions(copy);
  };
  const updateOption = (qIdx, oIdx, val) => {
    const copy = [...questions];
    copy[qIdx].options[oIdx] = val;
    setQuestions(copy);
  };
  const removeOption = (qIdx, oIdx) => {
    const copy = [...questions];
    copy[qIdx].options = copy[qIdx].options.filter((_, i) => i !== oIdx);
    setQuestions(copy);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!title.trim()) return alert("Please enter a title");
    if (!description.trim()) return alert("Please enter a description");
    
    const validQuestions = questions.filter((q) => q.question.trim());
    if (validQuestions.length === 0) return alert("Please add at least one question");
    
    for (let i = 0; i < validQuestions.length; i++) {
      if (!validQuestions[i].question.trim()) return alert(`Please enter text for Question ${i + 1}`);
      if (validQuestions[i].type === 'select' || validQuestions[i].type === 'multiselect') {
        const validOptions = validQuestions[i].options.filter(opt => opt.trim());
        if (validOptions.length === 0) {
          return alert(`Question ${i + 1} needs at least one option.`);
        }
      }
    }
    
    setSaving(true);
    try {
      const payload = {
        title,
        description,
        questions: validQuestions.map(q => ({
          text: {
            question: q.question,
            type: q.type,
            required: !!q.required,
            scope: 'common',
            options: (q.type === 'select' || q.type === 'multiselect') ? q.options.filter(opt => opt.trim()) : undefined,
          }
        }))
      };
      
      const res = await apiFetch("/api/surveys/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      if (!res.ok) throw new Error((await res.json()).error || "Unknown error");
      
      const data = await res.json();
      alert(`Survey template created successfully!`);
      
      setTitle("");
      setDescription("");
      setQuestions([{ question: "", type: "text", options: [""], required: false }]);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(SURVEY_FORM_DRAFT_KEY);
      }
    } catch (err) {
      alert("Error creating survey template: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { width: "100%", padding: '0.75rem', borderRadius: 8, border: '1px solid var(--color-bg-tertiary)', fontSize: '1rem' };
  const labelStyle = { display: "block", fontWeight: 600, marginBottom: '0.5rem', color: 'var(--color-text-primary)' };

  return (
    <div style={{ justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
      <form onSubmit={handleSubmit} style={{ maxWidth: 900, width: '100%' }}>
        <div className="asrs-card" style={{ padding: '1.5rem' }}>
          
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>Survey Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Enter survey title" style={inputStyle} />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>Description *</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="Provide a brief description of this survey" rows={3} style={{...inputStyle, resize: 'vertical'}} />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>Questions *</label>
            
            {questions.map((q, i) => (
              <div key={i} style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid var(--color-bg-tertiary)', borderRadius: 8, backgroundColor: 'var(--color-bg-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>Question {i + 1} *</span>
                  <div style={{ flex: 1 }}></div>
                  <button type="button" onClick={() => removeQuestion(i)} disabled={questions.length === 1} className="asrs-btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.875rem' }}>Remove</button>
                </div>
                
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  <input value={q.question} onChange={(e) => updateQuestion(i, 'question', e.target.value)} required placeholder={`Enter question ${i + 1}`} style={{ flex: '1 1 60%', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--color-bg-tertiary)', fontSize: '1rem' }} />
                  <select value={q.type} onChange={(e) => updateQuestion(i, 'type', e.target.value)} style={{ flex: '1 1 35%', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--color-bg-tertiary)', fontSize: '1rem', cursor: 'pointer' }}>
                    <option value="text">Text Response</option>
                    <option value="number">Numeric</option>
                    <option value="date">Date</option>
                    <option value="boolean">Yes / No</option>
                    <option value="rating">Rating (1-5)</option>
                    <option value="select">Multiple Choice</option>
                    <option value="multiselect">Multi-select (select all that apply)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem' }}>
                    <input type="checkbox" checked={!!q.required} onChange={(e) => updateQuestion(i, 'required', e.target.checked)} />
                    Required
                  </label>
                </div>

                {(q.type === 'select' || q.type === 'multiselect') && (
                  <div style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: 'var(--color-bg-primary)', borderRadius: 6, border: '1px dashed var(--color-bg-tertiary)' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Answer Options *</span>
                    {q.options && q.options.map((option, oIdx) => (
                      <div key={oIdx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <input value={option} onChange={(e) => updateOption(i, oIdx, e.target.value)} placeholder={`Option ${oIdx + 1}`} style={{ flex: 1, padding: '0.5rem', borderRadius: 6, border: '1px solid var(--color-bg-tertiary)', fontSize: '0.9rem' }} />
                        <button type="button" onClick={() => removeOption(i, oIdx)} disabled={q.options.length === 1} className="asrs-btn-secondary" style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}>✕</button>
                      </div>
                    ))}
                    <button type="button" onClick={() => addOption(i)} className="asrs-btn-secondary" style={{ fontSize: '0.875rem', padding: '0.4rem 0.75rem', marginTop: '0.25rem' }}>+ Add Option</button>
                  </div>
                )}

              </div>
            ))}
            
            <button type="button" onClick={addQuestion} className="asrs-btn-secondary">+ Add Question</button>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid var(--color-bg-tertiary)' }}>
            <button type="button" onClick={() => setPreviewOpen(true)} className="asrs-btn-secondary">Preview</button>
            <button type="submit" disabled={saving} className="asrs-btn-primary">{saving ? "Creating..." : "Create Survey Template"}</button>
          </div>
        </div>
      </form>
      {previewOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ width: '90%', maxWidth: 800, maxHeight: '90%', overflow: 'auto', background: 'var(--color-bg-primary)', padding: '1.25rem', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0 }}>Survey Preview</h3>
              <button type="button" onClick={() => setPreviewOpen(false)} className="asrs-btn-secondary">Close</button>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{title || 'Untitled Survey'}</div>
              <div style={{ color: 'var(--color-text-secondary)' }}>{description || 'No description provided.'}</div>
            </div>
            <div>
              {questions.filter(q => q.question && q.question.trim()).map((q, i) => (
                <div key={i} style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: 6, background: 'var(--color-bg-secondary)' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{q.question}{q.required ? ' *' : ''}</div>
                  {q.type === 'text' && <input disabled placeholder="Text response" style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--color-bg-tertiary)' }} />}
                  {q.type === 'number' && <input disabled type="number" placeholder="Numeric response" style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--color-bg-tertiary)' }} />}
                  {q.type === 'date' && <input disabled type="date" style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--color-bg-tertiary)' }} />}
                  {q.type === 'boolean' && (
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      {['Yes', 'No'].map(opt => (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <input type="radio" name={`preview-bool-${i}`} disabled />{opt}
                        </label>
                      ))}
                    </div>
                  )}
                  {q.type === 'rating' && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {[1,2,3,4,5].map(n => (
                        <span key={n} style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: '1px solid var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>{n}</span>
                      ))}
                    </div>
                  )}
                  {q.type === 'select' && q.options && (
                    <div>
                      {q.options.filter(o => o && o.trim()).map((opt, oIdx) => (
                        <label key={oIdx} style={{ display: 'block', marginBottom: '0.25rem' }}>
                          <input type="radio" name={`preview-${i}`} disabled style={{ marginRight: '0.5rem' }} />{opt}
                        </label>
                      ))}
                    </div>
                  )}
                  {q.type === 'multiselect' && q.options && (
                    <div>
                      {q.options.filter(o => o && o.trim()).map((opt, oIdx) => (
                        <label key={oIdx} style={{ display: 'block', marginBottom: '0.25rem' }}>
                          <input type="checkbox" disabled style={{ marginRight: '0.5rem' }} />{opt}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchTarget, updateTarget, fetchTargetHistory } from '../../api/targets';
import { format, parseISO } from 'date-fns';
import WorkflowStepper from './WorkflowStepper';
import DueDiligenceChecklist from './DueDiligenceChecklist';
import FileUpload from './FileUpload';
import StatusBadge from '../Claims/StatusBadge';
import DisclaimerBanner from '../shared/DisclaimerBanner';
import { WORKFLOW_STATUSES } from '../../constants';

const STAKING_CHECKLIST = [
  'Claim name assigned',
  'Location date set',
  'GPS coordinates recorded',
  'Proposed boundary sketch prepared',
  'County recording packet complete',
  'BLM Form 3830-1 prepared',
  '30-day county recording deadline tracked',
  '90-day BLM filing deadline tracked',
];

function Section({ title, children }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
      padding: '16px', marginBottom: '16px',
    }}>
      <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, color: '#374151' }}>{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ marginBottom: '6px', display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px' }}>
      <dt style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>{label}</dt>
      <dd style={{ fontSize: '13px', color: '#111827', margin: 0 }}>{value}</dd>
    </div>
  );
}

export default function TargetDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [notes, setNotes] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const debounceRef = useRef(null);

  const { data: target, isLoading, error } = useQuery({
    queryKey: ['target', id],
    queryFn: () => fetchTarget(id),
  });

  const { data: history = [] } = useQuery({
    queryKey: ['targetHistory', id],
    queryFn: () => fetchTargetHistory(id),
  });

  const updateMutation = useMutation({
    mutationFn: (body) => updateTarget(id, body),
    onSuccess: (updated) => {
      qc.setQueryData(['target', id], updated);
      qc.invalidateQueries({ queryKey: ['targetHistory', id] });
    },
  });

  useEffect(() => {
    if (target) setNotes(target.notes || '');
  }, [target?.id]);

  const handleNotesChange = (v) => {
    setNotes(v);
    setNoteSaved(false);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateMutation.mutate({ notes: v });
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    }, 1000);
  };

  if (isLoading) return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading target...</div>;
  if (error) return <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>Error: {error.message}</div>;
  if (!target) return null;

  const isApproved = target.workflow_status === 'approved';
  const ws = WORKFLOW_STATUSES.find((s) => s.key === target.workflow_status);

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <DisclaimerBanner />
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', background: '#fff', display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
        <button
          onClick={() => navigate('/targets')}
          style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '5px', padding: '5px 12px', cursor: 'pointer', fontSize: '13px', color: '#6b7280', flexShrink: 0 }}
        >
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <input
            type="text"
            value={target.internal_name || ''}
            onChange={(e) => updateMutation.mutate({ internal_name: e.target.value })}
            style={{
              border: 'none', outline: 'none', fontSize: '18px', fontWeight: 700, color: '#111827',
              background: 'transparent', width: '100%', padding: '0',
            }}
          />
          <div style={{ marginTop: '8px', overflowX: 'auto' }}>
            <WorkflowStepper currentStatus={target.workflow_status} />
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <select
            value={target.workflow_status}
            onChange={(e) => updateMutation.mutate({ workflow_status: e.target.value })}
            style={{
              border: `1px solid ${ws?.color || '#e5e7eb'}`, borderRadius: '5px', padding: '6px 10px',
              fontSize: '13px', color: ws?.color || '#374151', fontWeight: 600, cursor: 'pointer', background: '#fff',
            }}
          >
            {WORKFLOW_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {isApproved && (
        <div style={{
          margin: '16px 24px 0', background: '#fff7ed', border: '1px solid #f97316',
          borderRadius: '6px', padding: '12px 16px', fontSize: '13px', color: '#9a3412',
        }}>
          ⚠️ <strong>APPROVED status is internal only.</strong> Physical staking, county recording,
          and BLM filing require completion of all verification steps. This system does not
          constitute legal advice.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '16px', padding: '16px 24px' }}>
        {/* Left column */}
        <div>
          <Section title="Claim Summary">
            <Field label="Serial Number" value={target.serial_nr} />
            <Field label="Claim Name" value={target.claim_name} />
            <Field label="Claim Type" value={target.claim_type} />
            <Field label="Claimant" value={target.claimant_name} />
            <Field label="Location" value={[target.county, target.state].filter(Boolean).join(', ')} />
            <Field label="Acres" value={target.acres} />
            {target.case_status && (
              <div style={{ marginBottom: '6px', display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px' }}>
                <dt style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>Claim Status</dt>
                <dd style={{ margin: 0 }}>
                  <StatusBadge status={target.case_status} closedDt={target.closed_dt} />
                </dd>
              </div>
            )}
          </Section>

          <Section title="Due Diligence Checklist">
            <DueDiligenceChecklist targetId={Number(id)} />
          </Section>

          <Section title="Staking Packet Checklist (Prepare Manually)">
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '10px', background: '#fef3c7', padding: '8px 10px', borderRadius: '4px' }}>
              This is a preparation guide only. ClaimTrakr does not file claims.
            </div>
            {STAKING_CHECKLIST.map((item) => (
              <label key={item} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" style={{ accentColor: '#3b82f6' }} />
                {item}
              </label>
            ))}
          </Section>
        </div>

        {/* Right column */}
        <div>
          <Section title="Notes">
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Add research notes, observations..."
              rows={6}
              style={{
                width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb',
                borderRadius: '5px', fontSize: '13px', resize: 'vertical',
              }}
            />
            {noteSaved && <div style={{ fontSize: '11px', color: '#10b981', marginTop: '4px' }}>✓ Saved</div>}
          </Section>

          <Section title="Assignment & Priority">
            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Assigned To</label>
              <input
                type="text"
                defaultValue={target.assigned_to || ''}
                onBlur={(e) => updateMutation.mutate({ assigned_to: e.target.value })}
                style={{ width: '100%', padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: '4px', fontSize: '13px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Priority Score (0–100)</label>
              <input
                type="number"
                min={0} max={100}
                defaultValue={target.priority_score || 0}
                onBlur={(e) => updateMutation.mutate({ priority_score: parseInt(e.target.value) || 0 })}
                style={{ width: '100%', padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: '4px', fontSize: '13px' }}
              />
            </div>
          </Section>

          <Section title="Status History">
            {history.length === 0 ? (
              <div style={{ fontSize: '13px', color: '#9ca3af', fontStyle: 'italic' }}>No history yet.</div>
            ) : (
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {history.map((h) => (
                  <div key={h.id} style={{ padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: '12px' }}>
                    <div style={{ fontWeight: 500, color: '#374151' }}>
                      {h.from_status ? `${h.from_status} → ${h.to_status}` : h.to_status}
                    </div>
                    <div style={{ color: '#9ca3af' }}>
                      {h.changed_by || 'system'} · {h.changed_at ? format(parseISO(h.changed_at), 'MMM d, yyyy HH:mm') : ''}
                    </div>
                    {h.notes && <div style={{ color: '#6b7280' }}>{h.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Files">
            <FileUpload targetId={Number(id)} />
          </Section>
        </div>
      </div>
    </div>
  );
}

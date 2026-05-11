import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchLease, updateLease, deleteLease, fetchCriticalDates, createCriticalDate, updateCriticalDate, deleteCriticalDate } from '../api/leases';
import { fetchClaim } from '../api/claims';

const STATUS_COLORS = {
  active: '#22c55e',
  expired: '#ef4444',
  terminated: '#64748b',
};

const STATUS_LABELS = {
  active: 'Active',
  expired: 'Expired',
  terminated: 'Terminated',
};

const LEASE_STATUSES = ['active', 'expired', 'terminated'];

const DATE_TYPE_LABELS = {
  right_to_renew: 'Right to Renew',
  sublease: 'Sublease',
  renewal: 'Renewal',
  lease_expiration: 'Lease Expiration',
  custom: 'Custom',
};

const EMPTY_CD_FORM = { label: '', date_type: 'custom', critical_date: '', alert_days: 60, notes: '' };

function cdExpirationColor(days) {
  if (days == null || days < 0) return '#ef4444';
  if (days <= 30) return '#ef4444';
  if (days <= 60) return '#f59e0b';
  if (days <= 90) return '#eab308';
  return '#22c55e';
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(dateStr) - today) / 86400000);
}

function expirationColor(d) {
  if (d == null) return null;
  if (d <= 30) return '#ef4444';
  if (d <= 60) return '#f59e0b';
  if (d <= 90) return '#eab308';
  return null;
}

function Section({ title, children }) {
  return (
    <div style={{
      background: '#0f2039',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px',
      padding: '16px',
      marginBottom: '16px',
    }}>
      <h3 style={{
        margin: '0 0 14px', fontSize: '11px', fontWeight: 600,
        color: '#06b6d4', textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, value, mono, link, onLink }) {
  if (value == null || value === '') return (
    <div style={{ marginBottom: '10px', display: 'grid', gridTemplateColumns: '160px 1fr', gap: '8px', alignItems: 'start' }}>
      <dt style={{ fontSize: '11px', color: '#4b6079', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: '1px' }}>{label}</dt>
      <dd style={{ fontSize: '13px', color: '#4b6079', margin: 0, fontStyle: 'italic' }}>—</dd>
    </div>
  );
  return (
    <div style={{ marginBottom: '10px', display: 'grid', gridTemplateColumns: '160px 1fr', gap: '8px', alignItems: 'start' }}>
      <dt style={{ fontSize: '11px', color: '#4b6079', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: '1px' }}>{label}</dt>
      <dd style={{ fontSize: '13px', color: link ? '#2563eb' : '#ffffff', margin: 0, fontFamily: mono ? 'monospace' : 'inherit', cursor: link ? 'pointer' : 'default' }} onClick={onLink}>
        {value}
      </dd>
    </div>
  );
}

const EMPTY_FORM_FROM = (lease) => ({
  lease_name: lease.lease_name || '',
  serial_nr: lease.serial_nr || '',
  lessor: lease.lessor || '',
  lessee: lease.lessee || '',
  acreage: lease.acreage != null ? String(lease.acreage) : '',
  annual_payment: lease.annual_payment != null ? String(lease.annual_payment) : '',
  renewal_terms: lease.renewal_terms || '',
  start_dt: lease.start_dt || '',
  expiration_dt: lease.expiration_dt || '',
  workflow_status: lease.workflow_status || 'active',
  notes: lease.notes || '',
});

function EditModal({ lease, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY_FORM_FROM(lease));
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.expiration_dt) { setError('Expiration date is required'); return; }
    const body = {
      lease_name: form.lease_name,
      serial_nr: form.serial_nr || null,
      lessor: form.lessor || null,
      lessee: form.lessee || null,
      acreage: form.acreage ? parseFloat(form.acreage) : null,
      annual_payment: form.annual_payment ? parseFloat(form.annual_payment) : null,
      renewal_terms: form.renewal_terms || null,
      start_dt: form.start_dt || null,
      expiration_dt: form.expiration_dt,
      workflow_status: form.workflow_status,
      notes: form.notes || null,
    };
    try { await onSave(body); onClose(); }
    catch (e) {
      const detail = e.response?.data?.detail;
      setError(Array.isArray(detail) ? detail.map((d) => d.msg).join(', ') : detail || `Save failed (${e.response?.status ?? 'no response'})`);
    }
  }

  const inputStyle = {
    width: '100%', background: '#0d1f35', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '6px', padding: '7px 10px', color: '#f1f5f9', fontSize: '13px',
    boxSizing: 'border-box',
  };
  const labelStyle = {
    fontSize: '11px', fontWeight: 600, color: '#06b6d4', marginBottom: '4px',
    display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#0a1628', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '24px', width: '560px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>Edit Lease</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Lease Name *</label>
              <input style={inputStyle} value={form.lease_name} required onChange={(e) => set('lease_name', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Serial #</label>
              <input style={inputStyle} value={form.serial_nr} onChange={(e) => set('serial_nr', e.target.value.toUpperCase())} />
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select style={inputStyle} value={form.workflow_status} onChange={(e) => set('workflow_status', e.target.value)}>
                {LEASE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Lessor</label>
              <input style={inputStyle} value={form.lessor} onChange={(e) => set('lessor', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Lessee</label>
              <input style={inputStyle} value={form.lessee} onChange={(e) => set('lessee', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Acreage</label>
              <input style={inputStyle} type="number" step="0.0001" value={form.acreage} onChange={(e) => set('acreage', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Annual Payment ($)</label>
              <input style={inputStyle} type="number" step="0.01" value={form.annual_payment} onChange={(e) => set('annual_payment', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Start Date</label>
              <input style={inputStyle} type="date" value={form.start_dt} onChange={(e) => set('start_dt', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Expiration Date <span style={{ color: '#ef4444' }}>*</span></label>
              <input style={{ ...inputStyle, border: !form.expiration_dt ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.12)' }}
                type="date" value={form.expiration_dt} onChange={(e) => set('expiration_dt', e.target.value)} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Renewal Terms</label>
              <input style={inputStyle} value={form.renewal_terms} onChange={(e) => set('renewal_terms', e.target.value)} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Notes</label>
              <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
          </div>
          {error && <div style={{ marginTop: '12px', color: '#ef4444', fontSize: '13px' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
            <button type="button" onClick={onClose} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', padding: '8px 16px', color: '#94a3b8', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
            <button type="submit" style={{ background: '#2563eb', border: 'none', borderRadius: '6px', padding: '8px 18px', color: '#ffffff', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LeaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [cdForm, setCdForm] = useState(null); // null | 'new' | existing cd object
  const [cdDeleteConfirm, setCdDeleteConfirm] = useState(null);

  const { data: lease, isLoading } = useQuery({
    queryKey: ['lease', id],
    queryFn: () => fetchLease(id),
  });

  const { data: criticalDates = [] } = useQuery({
    queryKey: ['lease-dates', id],
    queryFn: () => fetchCriticalDates(id),
    enabled: !!id,
  });

  const createCdMutation = useMutation({
    mutationFn: (body) => createCriticalDate(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lease-dates', id] }); setCdForm(null); },
  });

  const updateCdMutation = useMutation({
    mutationFn: ({ dateId, body }) => updateCriticalDate(id, dateId, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lease-dates', id] }); setCdForm(null); },
  });

  const deleteCdMutation = useMutation({
    mutationFn: (dateId) => deleteCriticalDate(id, dateId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lease-dates', id] }); setCdDeleteConfirm(null); },
  });

  const { data: claim } = useQuery({
    queryKey: ['claim', lease?.serial_nr],
    queryFn: () => fetchClaim(lease.serial_nr),
    enabled: !!lease?.serial_nr,
  });

  const updateMutation = useMutation({
    mutationFn: (body) => updateLease(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lease', id] });
      qc.invalidateQueries({ queryKey: ['leases'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteLease(id),
    onSuccess: () => navigate('/leases'),
  });

  if (isLoading) return <div style={{ padding: '40px', textAlign: 'center', color: '#4b6079' }}>Loading...</div>;
  if (!lease) return <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>Lease not found</div>;

  const days = daysUntil(lease.expiration_dt);
  const expColor = lease.workflow_status === 'active' ? expirationColor(days) : null;
  const statusColor = STATUS_COLORS[lease.workflow_status] || '#4b6079';

  return (
    <div style={{ padding: '24px', maxWidth: '900px' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={() => navigate('/leases')}
          style={{ background: 'none', border: 'none', color: '#4b6079', cursor: 'pointer', fontSize: '13px', padding: 0, marginBottom: '12px' }}
        >
          ← Back to Leases
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: 700, color: '#ffffff' }}>
              {lease.lease_name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{
                background: statusColor + '22', border: `1px solid ${statusColor}55`,
                color: statusColor, borderRadius: '9999px', padding: '3px 12px',
                fontSize: '12px', fontWeight: 600,
              }}>
                {STATUS_LABELS[lease.workflow_status] || lease.workflow_status}
              </span>
              {lease.serial_nr && (
                <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#94a3b8' }}>
                  {lease.serial_nr}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setEditing(true)}
              style={{ background: '#1e3a5f', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '8px 16px', color: '#93c5fd', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}
            >
              Edit
            </button>
            <button
              onClick={() => setDeleteConfirm(true)}
              style={{ background: 'none', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '8px 16px', color: '#ef4444', cursor: 'pointer', fontSize: '13px' }}
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Expiration alert */}
      {lease.workflow_status === 'active' && !lease.expiration_dt && (
        <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: '#fca5a5', fontSize: '13px', fontWeight: 500 }}>
          ⚠ No expiration date set — add one to enable monitoring
        </div>
      )}
      {expColor && days != null && days >= 0 && (
        <div style={{ background: expColor + '18', border: `1px solid ${expColor}44`, borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: expColor, fontSize: '13px', fontWeight: 600 }}>
          ⏰ Expires in {days} day{days !== 1 ? 's' : ''} — {lease.expiration_dt}
        </div>
      )}
      {expColor && days != null && days < 0 && (
        <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: '#fca5a5', fontSize: '13px', fontWeight: 600 }}>
          ⚠ Expired {Math.abs(days)} day{Math.abs(days) !== 1 ? 's' : ''} ago — {lease.expiration_dt}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,340px)', gap: '16px' }}>
        <div>
          {/* Lease Details */}
          <Section title="Lease Details">
            <dl style={{ margin: 0 }}>
              <Field label="Lessor" value={lease.lessor} />
              <Field label="Lessee" value={lease.lessee} />
              <Field label="Acreage" value={lease.acreage != null ? lease.acreage.toLocaleString() + ' ac' : null} />
              <Field label="Annual Payment" value={lease.annual_payment != null ? `$${lease.annual_payment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null} />
              <Field label="Start Date" value={lease.start_dt} />
              <Field label="Expiration Date" value={lease.expiration_dt} />
              <Field label="Renewal Terms" value={lease.renewal_terms} />
              <Field
                label="Serial #"
                value={lease.serial_nr}
                mono
                link={!!lease.serial_nr}
                onLink={() => navigate(`/table?search=${lease.serial_nr}`)}
              />
            </dl>
          </Section>

          {/* Notes */}
          {lease.notes && (
            <Section title="Notes">
              <p style={{ margin: 0, fontSize: '13px', color: '#e2e8f0', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                {lease.notes}
              </p>
            </Section>
          )}
          {!lease.notes && (
            <Section title="Notes">
              <p style={{ margin: 0, fontSize: '13px', color: '#4b6079', fontStyle: 'italic' }}>
                No notes — click Edit to add notes
              </p>
            </Section>
          )}

          {/* Critical Dates */}
          <Section title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Critical Dates</span>
              <button
                onClick={() => setCdForm({ ...EMPTY_CD_FORM })}
                style={{ background: '#1e3a5f', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '5px', padding: '2px 10px', fontSize: '11px', color: '#93c5fd', cursor: 'pointer' }}
              >
                + Add Date
              </button>
            </div>
          }>
            {criticalDates.length === 0 ? (
              <p style={{ margin: 0, fontSize: '13px', color: '#4b6079', fontStyle: 'italic' }}>
                No critical dates — add renewal notices, payment deadlines, option exercise dates, etc.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {criticalDates.map((cd) => {
                  const days = daysUntil(cd.critical_date);
                  const color = cdExpirationColor(days);
                  const withinAlert = days != null && days <= cd.alert_days;
                  return (
                    <div key={cd.id} style={{
                      background: withinAlert ? color + '10' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${withinAlert ? color + '44' : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: '8px', padding: '10px 12px',
                      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px',
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>{cd.label}</span>
                          <span style={{ fontSize: '10px', color: '#4b6079', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', padding: '1px 6px' }}>
                            {DATE_TYPE_LABELS[cd.date_type] || cd.date_type}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '12px', color: withinAlert ? color : '#94a3b8' }}>{cd.critical_date}</span>
                          {days != null && (
                            <span style={{ fontSize: '11px', fontWeight: 600, color }}>
                              {days >= 0 ? `${days}d remaining` : `${Math.abs(days)}d overdue`}
                            </span>
                          )}
                          <span style={{ fontSize: '11px', color: '#4b6079' }}>Alert {cd.alert_days}d before</span>
                        </div>
                        {cd.notes && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{cd.notes}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button onClick={() => setCdForm({ ...cd, critical_date: cd.critical_date })}
                          style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '5px', padding: '3px 8px', fontSize: '11px', color: '#94a3b8', cursor: 'pointer' }}>
                          Edit
                        </button>
                        <button onClick={() => setCdDeleteConfirm(cd.id)}
                          style={{ background: 'none', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '5px', padding: '3px 8px', fontSize: '11px', color: '#ef4444', cursor: 'pointer' }}>
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>

        <div>
          {/* BLM Claim Data */}
          <Section title="Linked BLM Claim">
            {!lease.serial_nr ? (
              <p style={{ margin: 0, fontSize: '13px', color: '#4b6079', fontStyle: 'italic' }}>
                No serial number linked
              </p>
            ) : !claim ? (
              <p style={{ margin: 0, fontSize: '13px', color: '#4b6079', fontStyle: 'italic' }}>
                Loading claim data...
              </p>
            ) : (
              <dl style={{ margin: 0 }}>
                <Field label="Claim Name" value={claim.claim_name} />
                <Field label="Claim Type" value={claim.claim_type} />
                <Field label="Claimant" value={claim.claimant_name} />
                <Field label="Case Status" value={claim.case_status} />
                <Field label="State" value={claim.state} />
                <Field label="County" value={claim.county} />
                <Field label="Meridian" value={claim.meridian} />
                <Field label="Acres (BLM)" value={claim.acres != null ? claim.acres.toLocaleString() : null} />
                <Field label="Location Date" value={claim.location_dt} />
                <Field label="Filing Date" value={claim.filing_dt} />
                {claim.blm_url && (
                  <div style={{ marginTop: '10px' }}>
                    <a href={claim.blm_url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '12px', color: '#2563eb' }}>
                      View on BLM →
                    </a>
                  </div>
                )}
              </dl>
            )}
          </Section>

          {/* Metadata */}
          <Section title="Record Info">
            <dl style={{ margin: 0 }}>
              <Field label="Created By" value={lease.created_by} />
              <Field label="Created" value={lease.created_at ? new Date(lease.created_at).toLocaleDateString() : null} />
              <Field label="Last Updated" value={lease.updated_at ? new Date(lease.updated_at).toLocaleDateString() : null} />
            </dl>
          </Section>
        </div>
      </div>

      {editing && (
        <EditModal
          lease={lease}
          onClose={() => setEditing(false)}
          onSave={(body) => updateMutation.mutateAsync(body)}
        />
      )}

      {/* Critical date form modal */}
      {cdForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={(e) => e.target === e.currentTarget && setCdForm(null)}>
          <div style={{ background: '#0a1628', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '24px', width: '480px', maxWidth: '95vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
              {cdForm.id ? 'Edit Critical Date' : 'Add Critical Date'}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {[
                { label: 'Label *', key: 'label', full: true, type: 'text', placeholder: 'e.g. Renewal Notice Deadline' },
              ].map(({ label, key, full, type, placeholder }) => (
                <div key={key} style={{ gridColumn: full ? '1 / -1' : undefined }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: '#06b6d4', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
                  <input style={{ width: '100%', background: '#0d1f35', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', padding: '7px 10px', color: '#f1f5f9', fontSize: '13px', boxSizing: 'border-box' }}
                    type={type} value={cdForm[key] || ''} placeholder={placeholder}
                    onChange={(e) => setCdForm((f) => ({ ...f, [key]: e.target.value }))} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#06b6d4', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</label>
                <select style={{ width: '100%', background: '#0d1f35', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', padding: '7px 10px', color: '#f1f5f9', fontSize: '13px', boxSizing: 'border-box' }}
                  value={cdForm.date_type} onChange={(e) => setCdForm((f) => ({ ...f, date_type: e.target.value }))}>
                  {Object.entries(DATE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#06b6d4', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date *</label>
                <input style={{ width: '100%', background: '#0d1f35', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', padding: '7px 10px', color: '#f1f5f9', fontSize: '13px', boxSizing: 'border-box' }}
                  type="date" value={cdForm.critical_date || ''} onChange={(e) => setCdForm((f) => ({ ...f, critical_date: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#06b6d4', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Alert (days before)</label>
                <input style={{ width: '100%', background: '#0d1f35', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', padding: '7px 10px', color: '#f1f5f9', fontSize: '13px', boxSizing: 'border-box' }}
                  type="number" min="1" value={cdForm.alert_days} onChange={(e) => setCdForm((f) => ({ ...f, alert_days: parseInt(e.target.value) || 60 }))} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#06b6d4', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</label>
                <textarea style={{ width: '100%', background: '#0d1f35', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', padding: '7px 10px', color: '#f1f5f9', fontSize: '13px', boxSizing: 'border-box', minHeight: '60px', resize: 'vertical' }}
                  value={cdForm.notes || ''} onChange={(e) => setCdForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
              <button onClick={() => setCdForm(null)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', padding: '8px 16px', color: '#94a3b8', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button
                disabled={!cdForm.label || !cdForm.critical_date}
                onClick={() => {
                  const body = { label: cdForm.label, date_type: cdForm.date_type, critical_date: cdForm.critical_date, alert_days: cdForm.alert_days, notes: cdForm.notes || null };
                  cdForm.id ? updateCdMutation.mutate({ dateId: cdForm.id, body }) : createCdMutation.mutate(body);
                }}
                style={{ background: '#2563eb', border: 'none', borderRadius: '6px', padding: '8px 18px', color: '#ffffff', cursor: 'pointer', fontSize: '13px', fontWeight: 600, opacity: (!cdForm.label || !cdForm.critical_date) ? 0.5 : 1 }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {cdDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0a1628', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '24px', width: '340px' }}>
            <div style={{ fontWeight: 600, color: '#ffffff', marginBottom: '8px' }}>Remove this critical date?</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
              <button onClick={() => setCdDeleteConfirm(null)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', padding: '8px 16px', color: '#94a3b8', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button onClick={() => deleteCdMutation.mutate(cdDeleteConfirm)} style={{ background: '#ef4444', border: 'none', borderRadius: '6px', padding: '8px 16px', color: '#ffffff', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0a1628', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '24px', width: '360px' }}>
            <div style={{ fontWeight: 600, color: '#ffffff', marginBottom: '8px' }}>Delete "{lease.lease_name}"?</div>
            <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '20px' }}>This action cannot be undone.</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setDeleteConfirm(false)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', padding: '8px 16px', color: '#94a3b8', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button onClick={() => deleteMutation.mutate()} style={{ background: '#ef4444', border: 'none', borderRadius: '6px', padding: '8px 16px', color: '#ffffff', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

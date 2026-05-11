import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchLeases, createLease, updateLease, deleteLease, fetchUpcomingDates } from '../api/leases';
import { fetchClaim } from '../api/claims';

const LEASE_STATUSES = ['active', 'expired', 'terminated'];

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

function expirationColor(daysRemaining) {
  if (daysRemaining == null) return null;
  if (daysRemaining <= 30) return '#ef4444';
  if (daysRemaining <= 60) return '#f59e0b';
  if (daysRemaining <= 90) return '#eab308';
  return null;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(dateStr);
  return Math.round((exp - today) / 86400000);
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || '#4b6079';
  return (
    <span style={{
      background: color + '22',
      border: `1px solid ${color}55`,
      color,
      borderRadius: '9999px',
      padding: '2px 10px',
      fontSize: '11px',
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function ExpirationCell({ dateStr, status }) {
  if (!dateStr) return <span style={{ color: '#ef4444', fontSize: '12px', fontWeight: 600 }}>⚠ No expiration set</span>;
  const days = daysUntil(dateStr);
  const inactive = status === 'expired' || status === 'terminated';
  const color = inactive ? '#64748b' : expirationColor(days);
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ color: color || '#ffffff' }}>{dateStr}</span>
      {!inactive && days != null && days >= 0 && (
        <span style={{
          background: (color || '#4b6079') + '22',
          border: `1px solid ${(color || '#4b6079')}44`,
          borderRadius: '4px',
          padding: '1px 6px',
          fontSize: '10px',
          color: color || '#4b6079',
          fontWeight: 700,
        }}>
          {days}d
        </span>
      )}
      {!inactive && days != null && days < 0 && (
        <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: 600 }}>EXPIRED</span>
      )}
    </span>
  );
}

const EMPTY_FORM = {
  lease_name: '',
  serial_nr: '',
  lessor: '',
  lessee: '',
  acreage: '',
  annual_payment: '',
  renewal_terms: '',
  start_dt: '',
  expiration_dt: '',
  workflow_status: 'active',
  notes: '',
};

function LeaseModal({ lease, onClose, onSave }) {
  const [form, setForm] = useState(lease ? {
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
  } : { ...EMPTY_FORM });

  const [lookingUp, setLookingUp] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function lookupSerial() {
    if (!form.serial_nr) return;
    setLookingUp(true);
    try {
      const claim = await fetchClaim(form.serial_nr);
      if (claim) {
        setForm((f) => ({
          ...f,
          lessor: claim.claimant_name || f.lessor,
          acreage: claim.acres != null ? String(claim.acres) : f.acreage,
          lease_name: f.lease_name || claim.claim_name || f.lease_name,
        }));
      }
    } catch {
      // serial not found — leave fields as-is
    } finally {
      setLookingUp(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.expiration_dt) {
      setError('Expiration date is required');
      return;
    }
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
    try {
      await onSave(body);
      onClose();
    } catch (e) {
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
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#0a1628', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '14px', padding: '24px', width: '560px', maxWidth: '95vw',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <h2 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>
          {lease ? 'Edit Lease' : 'Add Lease'}
        </h2>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Lease Name *</label>
              <input style={inputStyle} value={form.lease_name} required onChange={(e) => set('lease_name', e.target.value)} />
            </div>

            <div>
              <label style={labelStyle}>Serial #</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  value={form.serial_nr}
                  placeholder="e.g. UTU123456"
                  onChange={(e) => set('serial_nr', e.target.value.toUpperCase())}
                />
                <button
                  type="button"
                  onClick={lookupSerial}
                  disabled={!form.serial_nr || lookingUp}
                  style={{
                    background: '#1e3a5f', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '6px', padding: '7px 10px', color: '#93c5fd',
                    fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {lookingUp ? '...' : 'Auto-fill'}
                </button>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Status</label>
              <select style={inputStyle} value={form.workflow_status} onChange={(e) => set('workflow_status', e.target.value)}>
                {LEASE_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
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
              <label style={labelStyle}>
                Expiration Date <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                style={{
                  ...inputStyle,
                  border: !form.expiration_dt ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.12)',
                }}
                type="date"
                value={form.expiration_dt}
                onChange={(e) => set('expiration_dt', e.target.value)}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Renewal Terms</label>
              <input style={inputStyle} value={form.renewal_terms} placeholder="e.g. 10-year renewal option" onChange={(e) => set('renewal_terms', e.target.value)} />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Notes</label>
              <textarea
                style={{ ...inputStyle, minHeight: '72px', resize: 'vertical' }}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </div>
          </div>

          {error && <div style={{ marginTop: '12px', color: '#ef4444', fontSize: '13px' }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
            <button type="button" onClick={onClose} style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '6px', padding: '8px 16px', color: '#94a3b8',
              cursor: 'pointer', fontSize: '13px',
            }}>Cancel</button>
            <button type="submit" style={{
              background: '#2563eb', border: 'none', borderRadius: '6px',
              padding: '8px 18px', color: '#ffffff', cursor: 'pointer',
              fontSize: '13px', fontWeight: 600,
            }}>Save Lease</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const FILTER_TABS = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'active' },
  { label: 'Expired', value: 'expired' },
  { label: 'Terminated', value: 'terminated' },
];

export default function LeasesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filterStatus, setFilterStatus] = useState('active');
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  const [modal, setModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const { data: leases = [], isLoading } = useQuery({
    queryKey: ['leases', filterStatus],
    queryFn: () => fetchLeases(filterStatus ? { workflow_status: filterStatus } : {}),
    refetchInterval: 60_000,
  });

  const { data: upcomingDates = [] } = useQuery({
    queryKey: ['upcomingDates', 365],
    queryFn: () => fetchUpcomingDates(365),
    staleTime: 60_000,
  });

  const nextDateByLease = upcomingDates.reduce((acc, d) => {
    if (!acc[d.lease_id]) acc[d.lease_id] = d;
    return acc;
  }, {});

  const createMutation = useMutation({
    mutationFn: createLease,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leases'] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => updateLease(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leases'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLease,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leases'] });
      setDeleteConfirm(null);
    },
  });

  const alertCounts = leases.reduce((acc, l) => {
    if (l.workflow_status === 'active' && l.expiration_dt) {
      const d = daysUntil(l.expiration_dt);
      if (d != null && d >= 0 && d <= 90) acc++;
    }
    return acc;
  }, 0);

  const noExpiration = leases.filter((l) => l.workflow_status === 'active' && !l.expiration_dt).length;

  const thStyle = {
    padding: '8px 12px', textAlign: 'left', fontSize: '11px',
    fontWeight: 600, color: '#06b6d4', textTransform: 'uppercase',
    letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.06)',
    whiteSpace: 'nowrap',
  };
  const tdStyle = { padding: '9px 12px', fontSize: '13px', color: '#f1f5f9', borderBottom: '1px solid rgba(255,255,255,0.04)' };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#ffffff' }}>Leases</h1>
        </div>
        <button
          onClick={() => setModal('create')}
          style={{
            background: '#2563eb', border: 'none', borderRadius: '8px',
            padding: '9px 18px', color: '#ffffff', cursor: 'pointer',
            fontSize: '13px', fontWeight: 600,
          }}
        >
          + Add Lease
        </button>
      </div>

      {/* Alert banners */}
      {noExpiration > 0 && (
        <div style={{
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '8px', padding: '10px 16px', marginBottom: '10px',
          fontSize: '13px', color: '#fca5a5',
        }}>
          ⚠ {noExpiration} active lease{noExpiration !== 1 ? 's have' : ' has'} no expiration date set
        </div>
      )}
      {alertCounts > 0 && (
        <div style={{
          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: '8px', padding: '10px 16px', marginBottom: '10px',
          fontSize: '13px', color: '#fcd34d',
        }}>
          ⏰ {alertCounts} active lease{alertCounts !== 1 ? 's are' : ' is'} expiring within 90 days
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {FILTER_TABS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setFilterStatus(value)}
            style={{
              background: filterStatus === value ? '#2563eb' : '#0f2039',
              border: `1px solid ${filterStatus === value ? '#2563eb' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '9999px',
              padding: '5px 14px',
              fontSize: '12px',
              fontWeight: filterStatus === value ? 600 : 400,
              color: filterStatus === value ? '#ffffff' : '#94a3b8',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{
        background: '#0f2039',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#4b6079', fontSize: '13px' }}>Loading...</div>
        ) : leases.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📄</div>
            <div style={{ color: '#4b6079', fontSize: '14px' }}>No leases found</div>
            <div style={{ color: '#4b6079', fontSize: '12px', marginTop: '4px' }}>
              <span
                onClick={() => setModal('create')}
                style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}
              >Add a lease</span>
            </div>
          </div>
        ) : isMobile ? (
          /* Mobile card layout */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {leases.map((lease) => {
              const days = daysUntil(lease.expiration_dt);
              const expColor = lease.workflow_status === 'active' ? expirationColor(days) : null;
              const nd = nextDateByLease[lease.id];
              return (
                <div key={lease.id} style={{
                  padding: '14px 16px',
                  background: expColor ? `${expColor}08` : '#0f2039',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <span
                      onClick={() => navigate(`/leases/${lease.id}`)}
                      style={{ fontSize: '14px', fontWeight: 700, color: '#2563eb', cursor: 'pointer', flex: 1, marginRight: '10px' }}
                    >
                      {lease.lease_name}
                    </span>
                    <StatusBadge status={lease.workflow_status} />
                  </div>

                  {lease.lessor && (
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>{lease.lessor}</div>
                  )}

                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontSize: '10px', color: '#06b6d4', textTransform: 'uppercase', fontWeight: 600, marginBottom: '1px' }}>Expiration</div>
                      <ExpirationCell dateStr={lease.expiration_dt} status={lease.workflow_status} />
                    </div>
                    {nd && (
                      <div>
                        <div style={{ fontSize: '10px', color: '#06b6d4', textTransform: 'uppercase', fontWeight: 600, marginBottom: '1px' }}>Next Date</div>
                        <div style={{ fontSize: '12px' }}>
                          <span style={{ color: '#94a3b8', marginRight: '4px' }}>{nd.label}</span>
                          <span style={{ color: nd.days_remaining <= 30 ? '#ef4444' : nd.days_remaining <= 60 ? '#f59e0b' : '#94a3b8' }}>
                            {nd.critical_date} ({nd.days_remaining}d)
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button
                      onClick={() => navigate(`/leases/${lease.id}`)}
                      style={{
                        flex: 1, background: '#1e3a5f', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '6px', padding: '7px', color: '#93c5fd',
                        cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                      }}
                    >View</button>
                    <button
                      onClick={() => setModal(lease)}
                      style={{
                        flex: 1, background: 'none', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '6px', padding: '7px', color: '#94a3b8',
                        cursor: 'pointer', fontSize: '12px',
                      }}
                    >Edit</button>
                    <button
                      onClick={() => setDeleteConfirm(lease.id)}
                      style={{
                        background: 'none', border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: '6px', padding: '7px 12px', color: '#ef4444',
                        cursor: 'pointer', fontSize: '12px',
                      }}
                    >Del</button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Desktop table layout */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead style={{ background: '#0d1f35' }}>
                <tr>
                  <th style={thStyle}>Lease Name</th>
                  <th style={thStyle}>Serial #</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Lessor</th>
                  <th style={thStyle}>Acreage</th>
                  <th style={thStyle}>Annual Payment</th>
                  <th style={thStyle}>Expiration</th>
                  <th style={thStyle}>Next Critical Date</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {leases.map((lease) => {
                  const days = daysUntil(lease.expiration_dt);
                  const expColor = lease.workflow_status === 'active' ? expirationColor(days) : null;
                  const missingExp = lease.workflow_status === 'active' && !lease.expiration_dt;
                  const rowBg = missingExp ? 'rgba(239,68,68,0.05)' : expColor ? `${expColor}08` : 'transparent';
                  return (
                    <tr
                      key={lease.id}
                      style={{ background: rowBg }}
                      onMouseEnter={(e) => e.currentTarget.style.background = expColor ? `${expColor}18` : 'rgba(255,255,255,0.03)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = rowBg}
                    >
                      <td style={{ ...tdStyle, fontWeight: 600, color: '#ffffff' }}>
                        <span onClick={() => navigate(`/leases/${lease.id}`)} style={{ cursor: 'pointer', color: '#2563eb' }}>
                          {lease.lease_name}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {lease.serial_nr ? (
                          <span
                            onClick={() => navigate(`/table?search=${lease.serial_nr}`)}
                            style={{ color: '#2563eb', cursor: 'pointer', fontFamily: 'monospace', fontSize: '12px' }}
                          >
                            {lease.serial_nr}
                          </span>
                        ) : <span style={{ color: '#4b6079' }}>—</span>}
                      </td>
                      <td style={tdStyle}><StatusBadge status={lease.workflow_status} /></td>
                      <td style={{ ...tdStyle, color: '#94a3b8' }}>{lease.lessor || <span style={{ color: '#4b6079' }}>—</span>}</td>
                      <td style={{ ...tdStyle, color: '#94a3b8' }}>
                        {lease.acreage != null ? lease.acreage.toLocaleString() : <span style={{ color: '#4b6079' }}>—</span>}
                      </td>
                      <td style={{ ...tdStyle, color: '#94a3b8' }}>
                        {lease.annual_payment != null
                          ? `$${lease.annual_payment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : <span style={{ color: '#4b6079' }}>—</span>}
                      </td>
                      <td style={tdStyle}>
                        <ExpirationCell dateStr={lease.expiration_dt} status={lease.workflow_status} />
                      </td>
                      <td style={tdStyle}>
                        {(() => {
                          const nd = nextDateByLease[lease.id];
                          if (!nd) return <span style={{ color: '#4b6079' }}>—</span>;
                          const d = nd.days_remaining;
                          const color = d <= 30 ? '#ef4444' : d <= 60 ? '#f59e0b' : d <= 90 ? '#eab308' : '#94a3b8';
                          return (
                            <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontSize: '11px', color: '#06b6d4', fontWeight: 600 }}>{nd.label}</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ color: color, fontSize: '12px' }}>{nd.critical_date}</span>
                                <span style={{
                                  background: color + '22', border: `1px solid ${color}44`,
                                  borderRadius: '4px', padding: '1px 5px', fontSize: '10px',
                                  color, fontWeight: 700,
                                }}>{d}d</span>
                              </span>
                            </span>
                          );
                        })()}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => setModal(lease)}
                          style={{
                            background: 'none', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '5px', padding: '4px 10px', color: '#94a3b8',
                            cursor: 'pointer', fontSize: '11px', marginRight: '6px',
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm(lease.id); }}
                          style={{
                            background: 'none', border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: '5px', padding: '4px 10px', color: '#ef4444',
                            cursor: 'pointer', fontSize: '11px',
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <LeaseModal
          lease={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
          onSave={modal === 'create'
            ? (body) => createMutation.mutateAsync(body)
            : (body) => updateMutation.mutateAsync({ id: modal.id, body })}
        />
      )}

      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#0a1628', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '12px', padding: '24px', width: '360px',
          }}>
            <div style={{ fontWeight: 600, color: '#ffffff', marginBottom: '8px' }}>Delete lease?</div>
            <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '20px' }}>This action cannot be undone.</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  background: 'none', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '6px', padding: '8px 16px', color: '#94a3b8',
                  cursor: 'pointer', fontSize: '13px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm)}
                style={{
                  background: '#ef4444', border: 'none', borderRadius: '6px',
                  padding: '8px 16px', color: '#ffffff', cursor: 'pointer',
                  fontSize: '13px', fontWeight: 600,
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  importPaymentReport, fetchPayments, fetchPaymentsSummary,
  fetchTownshipRanges, deletePaymentEntry,
} from '../api/payments';

const DISPOSITION_COLORS = {
  'ACTIVE':       '#22c55e',
  'FILED':        '#3b82f6',
  'UNDER REVIEW': '#f59e0b',
  'PENDING':      '#f97316',
  'SUBMITTED':    '#8b5cf6',
  'CLOSED':       '#6b7280',
  'FORFEITED':    '#ef4444',
};

function dispositionColor(d) {
  if (!d) return '#4b6079';
  return DISPOSITION_COLORS[d.toUpperCase()] || '#94a3b8';
}

function daysColor(d) {
  if (d == null) return '#94a3b8';
  if (d < 0) return '#ef4444';
  if (d <= 30) return '#ef4444';
  if (d <= 60) return '#f59e0b';
  if (d <= 90) return '#eab308';
  return '#22c55e';
}

function DispositionBadge({ value }) {
  const color = dispositionColor(value);
  return (
    <span style={{
      background: color + '22', border: `1px solid ${color}55`,
      color, borderRadius: '9999px', padding: '2px 9px',
      fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {value || '—'}
    </span>
  );
}

function ImportModal({ onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);

  function handleFileChange(e) {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setError('');
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result.slice(0, 300) + (ev.target.result.length > 300 ? '…' : ''));
    reader.readAsText(f);
  }

  async function handleImport() {
    if (!file) { setError('Select a file first.'); return; }
    setError('');
    setImporting(true);
    try {
      const text = await file.text();
      const result = await importPaymentReport(text);
      onImported(result);
      onClose();
    } catch (e) {
      const status = e.response?.status;
      const detail = e.response?.data?.detail;
      const msg = Array.isArray(detail)
        ? detail.map((d) => d.msg).join(', ')
        : (typeof detail === 'string' ? detail : null);
      setError(msg || (status ? `Server error ${status} — check server logs` : (e.message || 'Import failed')));
      console.error('Import error:', e.response?.data ?? e.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#0a1628', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '14px', padding: '24px', width: '520px', maxWidth: '95vw',
      }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>
          Import BLM Geographic Index Report
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#94a3b8' }}>
          Export the report from BLM as a tab-separated file (.txt, .tsv, or .csv),
          then select it below. Re-importing updates case disposition and payment dates.
        </p>

        <label style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: '8px', padding: '28px', borderRadius: '10px', cursor: 'pointer',
          border: `2px dashed ${file ? 'rgba(37,99,235,0.6)' : 'rgba(255,255,255,0.15)'}`,
          background: file ? 'rgba(37,99,235,0.08)' : '#0d1f35',
          transition: 'all 0.15s',
        }}>
          <input type="file" accept=".txt,.tsv,.csv" onChange={handleFileChange} style={{ display: 'none' }} />
          <span style={{ fontSize: '28px' }}>📂</span>
          {file ? (
            <>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#93c5fd' }}>{file.name}</span>
              <span style={{ fontSize: '11px', color: '#4b6079' }}>{(file.size / 1024).toFixed(1)} KB</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: '13px', color: '#94a3b8' }}>Click to select file</span>
              <span style={{ fontSize: '11px', color: '#4b6079' }}>.txt · .tsv · .csv</span>
            </>
          )}
        </label>

        {preview && (
          <div style={{
            marginTop: '12px', padding: '8px 10px', background: '#0d1f35',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px',
            fontSize: '11px', fontFamily: 'monospace', color: '#64748b',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {preview}
          </div>
        )}

        {error && <div style={{ color: '#ef4444', fontSize: '13px', marginTop: '10px' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <button onClick={onClose} style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '6px', padding: '8px 16px', color: '#94a3b8', cursor: 'pointer', fontSize: '13px',
          }}>Cancel</button>
          <button onClick={handleImport} disabled={importing || !file} style={{
            background: file ? '#2563eb' : '#1e3a5f', border: 'none', borderRadius: '6px',
            padding: '8px 20px', color: file ? '#fff' : '#4b6079',
            cursor: file ? 'pointer' : 'default', fontSize: '13px', fontWeight: 600,
          }}>
            {importing ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}

const FILTER_TABS = [
  { label: 'All', value: '' },
  { label: 'Unpaid', value: 'false' },
  { label: 'Paid', value: 'true' },
];

export default function PaymentsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showImport, setShowImport] = useState(false);
  const [filterPaid, setFilterPaid] = useState('false');
  const [filterTwp, setFilterTwp] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const { data: summary } = useQuery({
    queryKey: ['paymentsSummary'],
    queryFn: fetchPaymentsSummary,
    staleTime: 30_000,
  });

  const { data: twpRanges = [] } = useQuery({
    queryKey: ['townshipRanges'],
    queryFn: fetchTownshipRanges,
    staleTime: 60_000,
  });

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments', filterPaid, filterTwp],
    queryFn: () => fetchPayments({
      ...(filterPaid !== '' ? { is_paid: filterPaid } : {}),
      ...(filterTwp ? { meridian_twp_rng: filterTwp } : {}),
    }),
    staleTime: 15_000,
  });

  const deleteMutation = useMutation({
    mutationFn: deletePaymentEntry,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['paymentsSummary'] });
      qc.invalidateQueries({ queryKey: ['townshipRanges'] });
      setDeleteConfirm(null);
    },
  });

  function handleImported(result) {
    setImportResult(result);
    qc.invalidateQueries({ queryKey: ['payments'] });
    qc.invalidateQueries({ queryKey: ['paymentsSummary'] });
    qc.invalidateQueries({ queryKey: ['townshipRanges'] });
  }

  const currentSept1 = new Date(new Date().getFullYear(), 8, 1); // Sept 1 of current year

  const thStyle = {
    padding: '8px 12px', textAlign: 'left', fontSize: '11px',
    fontWeight: 600, color: '#06b6d4', textTransform: 'uppercase',
    letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.06)',
    whiteSpace: 'nowrap',
  };
  const tdStyle = {
    padding: '9px 12px', fontSize: '13px', color: '#f1f5f9',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1300px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#ffffff' }}>Payment Tracking</h1>
        <button onClick={() => setShowImport(true)} style={{
          background: '#2563eb', border: 'none', borderRadius: '8px',
          padding: '9px 18px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
        }}>
          + Import Report
        </button>
      </div>

      {/* Import success banner */}
      {importResult && (
        <div style={{
          background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: '8px', padding: '10px 16px', marginBottom: '12px',
          fontSize: '13px', color: '#86efac', display: 'flex', justifyContent: 'space-between',
        }}>
          <span>Imported {importResult.imported} unique claims from {importResult.raw_rows} report rows.</span>
          <span onClick={() => setImportResult(null)} style={{ cursor: 'pointer', color: '#4b6079' }}>✕</span>
        </div>
      )}

      {/* Summary cards */}
      {summary && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {[
            { label: 'Total Claims', value: summary.total, color: '#94a3b8' },
            { label: 'Unpaid', value: summary.unpaid, color: '#f59e0b' },
            { label: 'Due ≤ 30 days', value: summary.due_30, color: '#ef4444' },
            { label: 'Due ≤ 90 days', value: summary.due_90, color: '#eab308' },
            { label: 'Township Ranges', value: summary.township_ranges, color: '#06b6d4' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: '#0f2039', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px', padding: '12px 18px', minWidth: '130px',
            }}>
              <div style={{ fontSize: '22px', fontWeight: 700, color }}>{value ?? '—'}</div>
              <div style={{ fontSize: '11px', color: '#4b6079', marginTop: '2px' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {FILTER_TABS.map(({ label, value }) => (
            <button key={value} onClick={() => setFilterPaid(value)} style={{
              background: filterPaid === value ? '#2563eb' : '#0f2039',
              border: `1px solid ${filterPaid === value ? '#2563eb' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '9999px', padding: '5px 14px', fontSize: '12px',
              fontWeight: filterPaid === value ? 600 : 400,
              color: filterPaid === value ? '#fff' : '#94a3b8', cursor: 'pointer',
            }}>{label}</button>
          ))}
        </div>
        {twpRanges.length > 0 && (
          <select
            value={filterTwp}
            onChange={(e) => setFilterTwp(e.target.value)}
            style={{
              background: '#0f2039', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '8px', padding: '5px 10px', color: '#f1f5f9',
              fontSize: '12px', cursor: 'pointer',
            }}
          >
            <option value="">All Township/Ranges</option>
            {twpRanges.map((t) => (
              <option key={t.meridian_twp_rng} value={t.meridian_twp_rng}>
                {t.meridian_twp_rng} — {t.county}, {t.admin_state}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Table */}
      <div style={{
        background: '#0f2039', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px', overflow: 'hidden',
      }}>
        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#4b6079', fontSize: '13px' }}>Loading...</div>
        ) : payments.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>💰</div>
            <div style={{ color: '#4b6079', fontSize: '14px' }}>No records found</div>
            <div style={{ color: '#4b6079', fontSize: '12px', marginTop: '6px' }}>
              <span onClick={() => setShowImport(true)} style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}>
                Import a BLM Geographic Index report
              </span>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead style={{ background: '#0d1f35' }}>
                <tr>
                  <th style={thStyle}>Serial #</th>
                  <th style={thStyle}>Claim Name</th>
                  <th style={thStyle}>Claimant</th>
                  <th style={thStyle}>Township/Range</th>
                  <th style={thStyle}>Sections</th>
                  <th style={thStyle}>Disposition</th>
                  <th style={thStyle}>Located</th>
                  <th style={thStyle}>Next Pmt Due</th>
                  <th style={thStyle}>Paid?</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const d = p.days_remaining;
                  const urgColor = p.is_paid ? '#22c55e' : daysColor(d);
                  return (
                    <tr key={p.id}
                      style={{ background: p.is_paid ? 'rgba(34,197,94,0.04)' : d != null && d <= 30 ? 'rgba(239,68,68,0.05)' : 'transparent' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = p.is_paid ? 'rgba(34,197,94,0.04)' : d != null && d <= 30 ? 'rgba(239,68,68,0.05)' : 'transparent'}
                    >
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '12px' }}>
                        <span
                          onClick={() => navigate(`/table?search=${p.serial_nr}`)}
                          style={{ color: '#2563eb', cursor: 'pointer' }}
                        >
                          {p.serial_nr}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600, color: '#ffffff' }}>{p.claim_name || '—'}</td>
                      <td style={{ ...tdStyle, color: '#94a3b8', maxWidth: '160px' }}>{p.claimant || '—'}</td>
                      <td style={{ ...tdStyle, color: '#94a3b8', fontFamily: 'monospace', fontSize: '11px' }}>{p.meridian_twp_rng || '—'}</td>
                      <td style={{ ...tdStyle, color: '#94a3b8', fontSize: '12px' }}>{p.sections || '—'}</td>
                      <td style={tdStyle}><DispositionBadge value={p.case_disposition} /></td>
                      <td style={{ ...tdStyle, color: '#94a3b8', whiteSpace: 'nowrap' }}>{p.location_dt || '—'}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                        {p.next_pmt_due_dt ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: urgColor }}>{p.next_pmt_due_dt}</span>
                            {!p.is_paid && d != null && (
                              <span style={{
                                background: urgColor + '22', border: `1px solid ${urgColor}44`,
                                borderRadius: '4px', padding: '1px 6px',
                                fontSize: '10px', color: urgColor, fontWeight: 700,
                              }}>
                                {d < 0 ? 'OVERDUE' : `${d}d`}
                              </span>
                            )}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={tdStyle}>
                        {p.is_paid ? (
                          <span style={{
                            background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)',
                            borderRadius: '6px', padding: '3px 10px',
                            color: '#22c55e', fontSize: '12px', fontWeight: 600,
                          }}>Paid</span>
                        ) : (
                          <span style={{
                            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)',
                            borderRadius: '6px', padding: '3px 10px',
                            color: '#fca5a5', fontSize: '12px', fontWeight: 600,
                          }}>Unpaid</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <button
                          onClick={() => setDeleteConfirm(p.id)}
                          style={{
                            background: 'none', border: '1px solid rgba(239,68,68,0.25)',
                            borderRadius: '5px', padding: '3px 8px',
                            color: '#ef4444', cursor: 'pointer', fontSize: '11px',
                          }}
                        >Del</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImported={handleImported} />
      )}

      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#0a1628', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '12px', padding: '24px', width: '340px',
          }}>
            <div style={{ fontWeight: 600, color: '#ffffff', marginBottom: '8px' }}>Remove entry?</div>
            <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '20px' }}>This will not affect any other ClaimTrakr data.</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setDeleteConfirm(null)} style={{
                background: 'none', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '6px', padding: '8px 16px', color: '#94a3b8', cursor: 'pointer', fontSize: '13px',
              }}>Cancel</button>
              <button onClick={() => deleteMutation.mutate(deleteConfirm)} style={{
                background: '#ef4444', border: 'none', borderRadius: '6px',
                padding: '8px 16px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
              }}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchTargetsReport } from '../api/targets';
import { WORKFLOW_STATUSES } from '../constants';
import { format, parseISO } from 'date-fns';

function progressColor(pct) {
  if (pct === 100) return '#22c55e';
  if (pct >= 50) return '#2563eb';
  return '#f59e0b';
}

export default function ReportPage() {
  const printRef = useRef();

  const { data: targets = [], isLoading } = useQuery({
    queryKey: ['targetsReport'],
    queryFn: fetchTargetsReport,
    staleTime: 60_000,
  });

  const handlePrint = () => window.print();

  const byStatus = WORKFLOW_STATUSES.reduce((acc, s) => {
    acc[s.key] = targets.filter((t) => t.workflow_status === s.key).length;
    return acc;
  }, {});

  if (isLoading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#4b6079' }}>Loading report...</div>;
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', background: '#0a1628' }}>
      {/* Print-only styles injected inline */}
      <style>{`
        @media print {
          body { background: #fff !important; color: #000 !important; }
          .no-print { display: none !important; }
          .print-card { border: 1px solid #ccc !important; background: #fff !important; break-inside: avoid; }
          .print-header { background: #fff !important; color: #000 !important; }
        }
      `}</style>

      {/* Top bar */}
      <div className="no-print" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px',
        background: '#0f2039',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>Target Watchlist Report</span>
          <span style={{ marginLeft: '12px', fontSize: '12px', color: '#4b6079' }}>
            {targets.length} target{targets.length !== 1 ? 's' : ''} · Generated {format(new Date(), 'MMM d, yyyy h:mm a')}
          </span>
        </div>
        <button
          onClick={handlePrint}
          style={{
            background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px',
            padding: '7px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          }}
        >
          Print / Save PDF
        </button>
      </div>

      <div ref={printRef} style={{ padding: '20px', maxWidth: '960px', margin: '0 auto' }}>
        {/* Report header (visible in print) */}
        <div className="print-header" style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', marginBottom: '4px' }}>
            ⛏ ClaimTrakr — Target Watchlist
          </div>
          <div style={{ fontSize: '12px', color: '#4b6079' }}>
            {format(new Date(), 'MMMM d, yyyy')} · {targets.length} active targets
          </div>
        </div>

        {/* Summary pills */}
        <div style={{
          display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px',
          padding: '14px', background: '#0f2039', borderRadius: '10px',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          {WORKFLOW_STATUSES.filter((s) => byStatus[s.key] > 0).map((s) => (
            <span key={s.key} style={{
              background: s.color + '20', color: s.color,
              border: `1px solid ${s.color}50`,
              borderRadius: '9999px', padding: '3px 12px',
              fontSize: '12px', fontWeight: 600,
            }}>
              {s.label}: {byStatus[s.key]}
            </span>
          ))}
        </div>

        {/* Target cards */}
        {targets.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#4b6079', padding: '40px' }}>
            No targets found.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {targets.map((t) => {
              const ws = WORKFLOW_STATUSES.find((s) => s.key === t.workflow_status);
              const pct = t.checklist_total > 0
                ? Math.round((t.checklist_complete / t.checklist_total) * 100)
                : 0;
              const isClosed = t.case_status === 'CLOSED';

              return (
                <div key={t.id} className="print-card" style={{
                  background: '#0f2039',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '10px',
                  padding: '14px 18px',
                }}>
                  {/* Card header row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff', marginBottom: '2px' }}>
                        {t.internal_name || t.serial_nr}
                      </div>
                      <div style={{ fontSize: '12px', color: '#4b6079', fontFamily: 'monospace' }}>
                        {t.serial_nr}
                        {t.internal_name ? ` · ${t.serial_nr}` : ''}
                      </div>
                    </div>
                    {/* Workflow badge */}
                    <span style={{
                      background: (ws?.color || '#6b7280') + '20',
                      color: ws?.color || '#6b7280',
                      border: `1px solid ${(ws?.color || '#6b7280')}50`,
                      borderRadius: '9999px', padding: '3px 12px',
                      fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap',
                    }}>
                      {ws?.label || t.workflow_status}
                    </span>
                    {/* Claim status */}
                    <span style={{
                      background: isClosed ? 'rgba(156,163,175,0.15)' : 'rgba(34,197,94,0.15)',
                      color: isClosed ? '#9ca3af' : '#22c55e',
                      border: `1px solid ${isClosed ? '#9ca3af' : '#22c55e'}40`,
                      borderRadius: '9999px', padding: '3px 10px',
                      fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap',
                    }}>
                      {t.case_status}
                    </span>
                  </div>

                  {/* Details grid */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                    gap: '8px 16px', marginBottom: '10px',
                  }}>
                    {[
                      ['County / State', [t.county, t.state].filter(Boolean).join(', ')],
                      ['Claim Type', t.claim_type],
                      ['Claimant', t.claimant_name],
                      ['Acres', t.acres ? Number(t.acres).toFixed(1) : null],
                      ['Priority', t.priority_label],
                      ['Assigned To', t.assigned_to],
                    ].filter(([, v]) => v).map(([label, value]) => (
                      <div key={label}>
                        <div style={{ fontSize: '10px', color: '#06b6d4', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '1px' }}>
                          {label}
                        </div>
                        <div style={{ fontSize: '13px', color: '#94a3b8' }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Checklist progress */}
                  {t.checklist_total > 0 && (
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#4b6079' }}>
                          Due diligence: {t.checklist_complete}/{t.checklist_total} complete
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: progressColor(pct) }}>{pct}%</span>
                      </div>
                      <div style={{ height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${pct}%`,
                          background: progressColor(pct),
                          transition: 'width 0.3s', borderRadius: '3px',
                        }} />
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {t.notes && (
                    <div style={{
                      marginTop: '8px', padding: '8px 10px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '6px', fontSize: '12px', color: '#94a3b8',
                    }}>
                      {t.notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

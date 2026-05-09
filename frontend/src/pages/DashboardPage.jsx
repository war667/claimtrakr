import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchStats } from '../api/reference';
import { fetchIngestionStatus } from '../api/ingest';
import { INGESTION_STATUS_COLORS } from '../constants';
import useIsMobile from '../hooks/useIsMobile';
import { format, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';

function StatCard({ icon, label, value, sublabel, empty, green, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#0f2039',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        opacity: empty ? 0.5 : 1,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.borderColor = 'rgba(37,99,235,0.5)'; }}
      onMouseLeave={(e) => { if (onClick) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
    >
      <div style={{ fontSize: '22px', lineHeight: 1 }}>{icon}</div>
      <div style={{
        fontSize: '1.9rem',
        fontWeight: 700,
        color: empty ? '#4b6079' : green ? '#22c55e' : '#ffffff',
        lineHeight: 1.1,
      }}>
        {value ?? 0}
      </div>
      <div style={{
        fontSize: '11px',
        fontWeight: 600,
        color: '#06b6d4',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        {label}
      </div>
      {sublabel && <div style={{ fontSize: '11px', color: '#4b6079' }}>{sublabel}</div>}
    </div>
  );
}

const EVENT_TYPE_LABELS = {
  new_claim: 'New Claim',
  status_changed: 'Status Changed',
  claimant_changed: 'Claimant Changed',
  disposition_changed: 'Disposition Changed',
  claim_removed: 'Claim Removed',
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 60_000,
  });

  const { data: ingestStatus, isLoading: ingestLoading } = useQuery({
    queryKey: ['ingestionStatus'],
    queryFn: fetchIngestionStatus,
    refetchInterval: 30_000,
  });

  const isEmpty = !stats || stats.total_claims === 0;
  const isMobile = useIsMobile();
  const pad = isMobile ? '12px' : '24px';

  return (
    <div style={{ padding: pad, maxWidth: '1200px' }}>
      <style>{`.info-tooltip-wrap:hover .info-tooltip { display: block !important; }`}</style>
      {isEmpty && !statsLoading && (
        <div style={{
          background: 'rgba(37,99,235,0.12)',
          border: '1px solid rgba(37,99,235,0.3)',
          borderRadius: '8px',
          padding: '14px 18px',
          marginBottom: '20px',
          fontSize: '14px',
          color: '#93c5fd',
        }}>
          No claims ingested yet. Go to the{' '}
          <button
            onClick={() => navigate('/ingestion')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#2563eb', fontWeight: 600, textDecoration: 'underline',
              padding: 0, fontSize: '14px',
            }}
          >
            Ingestion page
          </button>{' '}
          to pull data from BLM sources.
        </div>
      )}

      {/* Stat Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '12px',
        marginBottom: '24px',
      }}>
        <StatCard icon="📊" label="Total Claims" value={stats?.total_claims?.toLocaleString()} empty={isEmpty} onClick={() => navigate('/table')} />
        <StatCard icon="✅" label="Active Claims" value={stats?.active_claims?.toLocaleString()} empty={isEmpty} green onClick={() => navigate('/table?status=ACTIVE')} />
        <StatCard icon="🔒" label="Closed Claims" value={stats?.closed_claims?.toLocaleString()} empty={isEmpty} onClick={() => navigate('/table?status=CLOSED')} />
        <StatCard icon="📅" label="Closed Last 30d" value={stats?.closed_last_30_days?.toLocaleString()} empty={isEmpty} onClick={() => navigate('/table?status=CLOSED&closed_within_days=30')} />
        <StatCard icon="🎯" label="Active Targets" value={stats?.active_targets?.toLocaleString()} empty={false} green onClick={() => navigate('/targets')} />
        <StatCard icon="🏕" label="Pending Field Check" value={stats?.targets_pending_field_check?.toLocaleString()} empty={false} onClick={() => navigate('/targets?workflow_status=needs_field_check')} />
      </div>

      {/* Ingestion Health */}
      <div style={{
        background: '#0f2039',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '20px',
      }}>
        <h2 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 600, color: '#06b6d4', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Ingestion Health
        </h2>
        {ingestLoading ? (
          <div style={{ color: '#4b6079', fontSize: '13px' }}>Loading...</div>
        ) : (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {(ingestStatus?.sources || []).map((s) => {
              const status = s.last_run_status || 'never';
              const color = INGESTION_STATUS_COLORS[status];
              return (
                <div key={s.source_key} style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: color + '18', border: `1px solid ${color}44`,
                  borderRadius: '9999px', padding: '5px 14px', fontSize: '13px',
                }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, display: 'inline-block' }} />
                  <span style={{ fontWeight: 500, color: '#ffffff' }}>{s.display_name}</span>
                  <span style={{ color: '#4b6079' }}>
                    {s.last_run_at ? format(parseISO(s.last_run_at), 'MMM d HH:mm') : 'never'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Events */}
      <div style={{
        background: '#0f2039',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        padding: '16px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#06b6d4', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Recent Claim Events
            </h2>
            <div style={{ position: 'relative', display: 'inline-block' }} className="info-tooltip-wrap">
              <span style={{ fontSize: '12px', color: '#4b6079', cursor: 'default', userSelect: 'none' }}>ⓘ</span>
              <div className="info-tooltip" style={{
                display: 'none', position: 'absolute', top: '20px', left: 0, zIndex: 100,
                background: '#0d1f35', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '8px', padding: '12px 14px', width: '300px',
                fontSize: '12px', color: '#94a3b8', lineHeight: '1.6',
              }}>
                <div style={{ fontWeight: 600, color: '#ffffff', marginBottom: '8px' }}>When does a claim appear here?</div>
                <div style={{ marginBottom: '4px' }}><span style={{ color: '#22c55e' }}>●</span> <strong style={{ color: '#e2e8f0' }}>New Claim</strong> — serial number not seen before</div>
                <div style={{ marginBottom: '4px' }}><span style={{ color: '#f59e0b' }}>●</span> <strong style={{ color: '#e2e8f0' }}>Status Changed</strong> — ACTIVE ↔ CLOSED</div>
                <div style={{ marginBottom: '4px' }}><span style={{ color: '#3b82f6' }}>●</span> <strong style={{ color: '#e2e8f0' }}>Claimant Changed</strong> — owner name changed</div>
                <div><span style={{ color: '#ef4444' }}>●</span> <strong style={{ color: '#e2e8f0' }}>Claim Removed</strong> — no longer returned by BLM</div>
                <div style={{ marginTop: '8px', color: '#4b6079', fontSize: '11px' }}>Events are detected on each ingestion run.</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {stats?.total_events != null && (
              <span style={{ fontSize: '11px', color: '#4b6079' }}>
                {stats.total_events.toLocaleString()} total events in DB
              </span>
            )}
            <span
              onClick={() => navigate('/table?changed_within_days=7')}
              style={{ fontSize: '12px', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}
            >
              View changed last 7 days →
            </span>
          </div>
        </div>
        {statsLoading ? (
          <div style={{ color: '#4b6079', fontSize: '13px' }}>Loading...</div>
        ) : !stats?.recent_events?.length ? (
          <div style={{ color: '#4b6079', fontSize: '13px', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
            No events yet — ingest data to begin monitoring
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#0d1f35' }}>
                {['Time', 'Serial #', 'Event', 'Detail'].map((h) => (
                  <th key={h} style={{
                    padding: '6px 12px', textAlign: 'left', fontSize: '11px',
                    fontWeight: 600, color: '#06b6d4', textTransform: 'uppercase',
                    letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.recent_events.map((ev, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '7px 12px', color: '#4b6079', whiteSpace: 'nowrap' }}>
                    {ev.detected_at ? format(parseISO(ev.detected_at), 'MMM d HH:mm') : '—'}
                  </td>
                  <td style={{ padding: '7px 12px', fontFamily: 'monospace' }}>
                    <span
                      onClick={() => navigate(`/table?search=${ev.serial_nr}`)}
                      style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'none' }}
                    >
                      {ev.serial_nr}
                    </span>
                  </td>
                  <td style={{ padding: '7px 12px', color: '#ffffff' }}>{EVENT_TYPE_LABELS[ev.event_type] || ev.event_type}</td>
                  <td style={{ padding: '7px 12px', color: '#94a3b8' }}>
                    {ev.old_value && ev.new_value ? `${ev.old_value} → ${ev.new_value}` : (ev.event_subtype || '')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

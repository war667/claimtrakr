import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchTargets, createTarget } from '../../api/targets';
import StatusBadge from '../Claims/StatusBadge';
import { WORKFLOW_STATUSES } from '../../constants';
import EmptyState from '../shared/EmptyState';
import { format, parseISO } from 'date-fns';
import useIsMobile from '../../hooks/useIsMobile';

export default function TargetList({ filters }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [page, setPage] = useState(1);
  const [newTargetModal, setNewTargetModal] = useState(false);
  const [newSerial, setNewSerial] = useState('');
  const [createError, setCreateError] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['targets', filters, page],
    queryFn: () => fetchTargets({ ...filters, page, page_size: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: () => createTarget({ serial_nr: newSerial.trim() }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['targets'] });
      setNewTargetModal(false);
      setNewSerial('');
      navigate(`/targets/${t.id}`);
    },
    onError: (e) => setCreateError(e.response?.data?.detail || 'Creation failed'),
  });

  const items = data?.items || [];
  const total = data?.total || 0;

  const statusCounts = WORKFLOW_STATUSES.reduce((acc, s) => {
    acc[s.key] = items.filter((t) => t.workflow_status === s.key).length;
    return acc;
  }, {});

  if (isLoading) return <div style={{ padding: '40px', textAlign: 'center', color: '#4b6079' }}>Loading targets...</div>;
  if (error) return <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>Error: {error.message}</div>;

  return (
    <div>
      {/* Summary Pills */}
      <div style={{
        display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '10px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: '#0f2039',
      }}>
        {WORKFLOW_STATUSES.filter((s) => statusCounts[s.key] > 0).map((s) => (
          <span key={s.key} style={{
            background: s.color + '18', color: s.color, border: `1px solid ${s.color}44`,
            borderRadius: '9999px', padding: '2px 10px', fontSize: '12px', fontWeight: 600,
          }}>
            {s.label}: {statusCounts[s.key]}
          </span>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setNewTargetModal(true)}
          style={{
            background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px',
            padding: '4px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: 600,
          }}
        >
          + New Target
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="No targets yet"
          message="Add claims to your target list from the Claims Table or Map pages."
        />
      ) : isMobile ? (
        <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.map((t) => {
            const ws = WORKFLOW_STATUSES.find((s) => s.key === t.workflow_status);
            return (
              <div
                key={t.id}
                onClick={() => navigate(`/targets/${t.id}`)}
                style={{
                  background: '#0f2039',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: '#ffffff', flex: 1 }}>
                    {t.internal_name || t.serial_nr}
                  </div>
                  <span style={{
                    background: (ws?.color || '#6b7280') + '18',
                    color: ws?.color || '#6b7280',
                    border: `1px solid ${(ws?.color || '#6b7280')}44`,
                    borderRadius: '9999px', padding: '2px 8px', fontSize: '11px', fontWeight: 600,
                    flexShrink: 0,
                  }}>
                    {ws?.label || t.workflow_status}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#2563eb', fontFamily: 'monospace', marginBottom: '6px' }}>
                  {t.serial_nr}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <StatusBadge status={t.case_status} closedDt={t.closed_dt} />
                  {t.claim_type && <span style={{ fontSize: '11px', color: '#4b6079' }}>{t.claim_type}</span>}
                  {t.priority_label && <span style={{ fontSize: '11px', color: '#4b6079' }}>{t.priority_label}</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#0d1f35' }}>
                {['Internal Name', 'Serial #', 'County', 'Type', 'Claim Status', 'Workflow', 'Assigned', 'Priority', 'Created'].map((h) => (
                  <th key={h} style={{
                    padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: '11px',
                    color: '#06b6d4', textTransform: 'uppercase', letterSpacing: '0.04em',
                    borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((t) => {
                const ws = WORKFLOW_STATUSES.find((s) => s.key === t.workflow_status);
                return (
                  <tr
                    key={t.id}
                    onClick={() => navigate(`/targets/${t.id}`)}
                    style={{ cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#0d1f35')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: '8px 12px', fontWeight: 500, color: '#ffffff' }}>{t.internal_name || '—'}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '12px', color: '#2563eb' }}>{t.serial_nr}</td>
                    <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{t.county || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{t.claim_type || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <StatusBadge status={t.case_status} closedDt={t.closed_dt} />
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{
                        background: (ws?.color || '#6b7280') + '18',
                        color: ws?.color || '#6b7280',
                        border: `1px solid ${(ws?.color || '#6b7280')}44`,
                        borderRadius: '9999px', padding: '2px 8px', fontSize: '11px', fontWeight: 600,
                      }}>
                        {ws?.label || t.workflow_status}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{t.assigned_to || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{t.priority_label || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#4b6079', fontSize: '12px' }}>
                      {t.created_at ? format(parseISO(t.created_at), 'MMM d, yyyy') : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* New Target Modal */}
      {newTargetModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#0f2039',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '12px',
            padding: '24px', width: '360px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: '#ffffff' }}>New Target</h3>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#06b6d4', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Claim Serial Number
            </label>
            <input
              type="text"
              value={newSerial}
              onChange={(e) => setNewSerial(e.target.value)}
              placeholder="e.g. UMC123456"
              style={{
                width: '100%', marginTop: '6px', padding: '8px 10px',
                background: '#0d1f35', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '6px', fontSize: '14px', color: '#ffffff',
              }}
              autoFocus
            />
            {createError && <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '6px' }}>{createError}</div>}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button
                onClick={() => createMutation.mutate()}
                disabled={!newSerial.trim() || createMutation.isPending}
                style={{
                  flex: 1, background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px',
                  padding: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: 600,
                }}
              >
                {createMutation.isPending ? 'Creating...' : 'Create Target'}
              </button>
              <button
                onClick={() => { setNewTargetModal(false); setCreateError(''); setNewSerial(''); }}
                style={{
                  background: '#0d1f35', color: '#94a3b8',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px', padding: '8px 16px', fontSize: '14px', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

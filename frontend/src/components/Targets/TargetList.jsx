import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchTargets, createTarget } from '../../api/targets';
import StatusBadge from '../Claims/StatusBadge';
import { WORKFLOW_STATUSES } from '../../constants';
import EmptyState from '../shared/EmptyState';
import { format, parseISO } from 'date-fns';

export default function TargetList({ filters }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
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

  if (isLoading) return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading targets...</div>;
  if (error) return <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>Error: {error.message}</div>;

  return (
    <div>
      {/* Summary Pills */}
      <div style={{
        display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '10px 16px',
        borderBottom: '1px solid #e5e7eb', background: '#fff',
      }}>
        {WORKFLOW_STATUSES.filter((s) => statusCounts[s.key] > 0).map((s) => (
          <span key={s.key} style={{
            background: s.color + '22', color: s.color, border: `1px solid ${s.color}44`,
            borderRadius: '9999px', padding: '2px 10px', fontSize: '12px', fontWeight: 600,
          }}>
            {s.label}: {statusCounts[s.key]}
          </span>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setNewTargetModal(true)}
          style={{
            background: '#1e293b', color: '#fff', border: 'none', borderRadius: '5px',
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
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Internal Name', 'Serial #', 'County', 'Type', 'Claim Status', 'Workflow', 'Assigned', 'Priority', 'Created'].map((h) => (
                  <th key={h} style={{
                    padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: '12px',
                    color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em',
                    borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap',
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
                    style={{ cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>{t.internal_name || '—'}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '12px', color: '#2563eb' }}>{t.serial_nr}</td>
                    <td style={{ padding: '8px 12px' }}>{t.county || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{t.claim_type || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <StatusBadge status={t.case_status} closedDt={t.closed_dt} />
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{
                        background: (ws?.color || '#6b7280') + '22',
                        color: ws?.color || '#6b7280',
                        border: `1px solid ${(ws?.color || '#6b7280')}44`,
                        borderRadius: '9999px', padding: '2px 8px', fontSize: '11px', fontWeight: 600,
                      }}>
                        {ws?.label || t.workflow_status}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>{t.assigned_to || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{t.priority_label || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#9ca3af', fontSize: '12px' }}>
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
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: '8px', padding: '24px', width: '360px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>New Target</h3>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
              Claim Serial Number
            </label>
            <input
              type="text"
              value={newSerial}
              onChange={(e) => setNewSerial(e.target.value)}
              placeholder="e.g. UMC123456"
              style={{
                width: '100%', marginTop: '6px', padding: '8px 10px',
                border: '1px solid #e5e7eb', borderRadius: '5px', fontSize: '14px',
              }}
              autoFocus
            />
            {createError && <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '6px' }}>{createError}</div>}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button
                onClick={() => createMutation.mutate()}
                disabled={!newSerial.trim() || createMutation.isPending}
                style={{
                  flex: 1, background: '#1e293b', color: '#fff', border: 'none', borderRadius: '5px',
                  padding: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: 600,
                }}
              >
                {createMutation.isPending ? 'Creating...' : 'Create Target'}
              </button>
              <button
                onClick={() => { setNewTargetModal(false); setCreateError(''); setNewSerial(''); }}
                style={{
                  background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb',
                  borderRadius: '5px', padding: '8px 16px', fontSize: '14px', cursor: 'pointer',
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

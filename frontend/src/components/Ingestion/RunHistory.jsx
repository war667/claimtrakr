import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchIngestionRuns, fetchIngestionRun, cleanupRuns } from '../../api/ingest';
import { INGESTION_STATUS_COLORS } from '../../constants';
import { format, parseISO, differenceInSeconds } from 'date-fns';

function StatusBadge({ status }) {
  const color = INGESTION_STATUS_COLORS[status] || INGESTION_STATUS_COLORS.never;
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}44`,
      borderRadius: '9999px', padding: '2px 8px', fontSize: '11px', fontWeight: 600,
    }}>
      {status}
    </span>
  );
}

function RunRow({ run }) {
  const [expanded, setExpanded] = useState(false);
  const { data: detail } = useQuery({
    queryKey: ['ingestionRunDetail', run.id],
    queryFn: () => fetchIngestionRun(run.id),
    enabled: expanded,
  });

  const duration = run.finished_at && run.started_at
    ? differenceInSeconds(parseISO(run.finished_at), parseISO(run.started_at))
    : null;

  return (
    <>
      <tr
        onClick={() => setExpanded((v) => !v)}
        style={{ cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#0d1f35')}
        onMouseLeave={(e) => (e.currentTarget.style.background = '')}
      >
        <td style={TD}>{run.id}</td>
        <td style={{ ...TD, color: '#ffffff' }}>{run.source_name || `Source ${run.source_id}`}</td>
        <td style={TD}>{run.triggered_by || '—'}</td>
        <td style={TD}>{run.started_at ? format(parseISO(run.started_at), 'MMM d HH:mm') : '—'}</td>
        <td style={TD}>{duration != null ? `${duration}s` : '—'}</td>
        <td style={TD}><StatusBadge status={run.status} /></td>
        <td style={TD}>{run.records_fetched?.toLocaleString()}</td>
        <td style={TD}>{run.records_upserted?.toLocaleString()}</td>
        <td style={TD}>{run.changes_detected?.toLocaleString()}</td>
        <td style={{ ...TD, color: run.records_errored > 0 ? '#ef4444' : '#4b6079' }}>
          {run.records_errored}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={10} style={{ padding: '0 16px 12px', background: '#080f1e' }}>
            {run.error_summary && (
              <div style={{
                fontSize: '12px', padding: '6px 10px', marginTop: '8px',
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: '4px', color: '#fca5a5', marginBottom: '6px',
              }}>
                {run.error_summary}
              </div>
            )}
            {!detail ? (
              <div style={{ fontSize: '12px', color: '#4b6079', padding: '8px 0' }}>Loading...</div>
            ) : detail.errors?.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#94a3b8', padding: '8px 0' }}>No errors for this run.</div>
            ) : (
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: '#94a3b8' }}>
                  Errors ({detail.errors.length})
                </div>
                {detail.errors.slice(0, 20).map((e) => (
                  <div key={e.id} style={{
                    fontSize: '11px', padding: '4px 8px',
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    borderRadius: '4px', marginBottom: '4px',
                    color: '#fca5a5',
                  }}>
                    [{e.error_type}] {e.serial_nr ? `${e.serial_nr}: ` : ''}{e.error_message}
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

const TD = {
  padding: '8px 12px', fontSize: '13px', color: '#94a3b8', whiteSpace: 'nowrap',
};
const TH = {
  ...TD,
  background: '#0d1f35',
  fontWeight: 600,
  fontSize: '11px',
  color: '#06b6d4',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
};

export default function RunHistory() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['ingestionRuns', page, statusFilter],
    queryFn: () => fetchIngestionRuns({ page, page_size: 50, status: statusFilter || undefined }),
    refetchInterval: 10_000,
  });

  const cleanupMutation = useMutation({
    mutationFn: cleanupRuns,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['ingestionRuns'] });
      alert(`Done: ${result.stuck_fixed} stuck runs fixed, ${result.old_runs_deleted} old runs removed.`);
    },
  });

  if (isLoading) return (
    <div style={{ padding: '20px', color: '#4b6079', fontSize: '13px' }}>Loading run history...</div>
  );

  const runs = data?.items || [];
  const total = data?.total || 0;

  return (
    <div>
      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: '#0f2039',
      }}>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          style={{
            padding: '4px 8px', background: '#0d1f35', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '6px', fontSize: '12px', color: '#ffffff',
          }}
        >
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="partial">Partial</option>
          <option value="error">Error</option>
          <option value="running">Running</option>
        </select>
        <span style={{ fontSize: '12px', color: '#4b6079' }}>
          {total} run{total !== 1 ? 's' : ''}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => cleanupMutation.mutate()}
          disabled={cleanupMutation.isPending}
          style={{
            background: '#0d1f35', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px', padding: '4px 12px', fontSize: '12px',
            cursor: 'pointer', color: '#94a3b8',
          }}
        >
          {cleanupMutation.isPending ? 'Cleaning...' : '🧹 Clean Up Stale Runs'}
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Run ID', 'Source', 'Triggered By', 'Started', 'Duration', 'Status', 'Fetched', 'Upserted', 'Changes', 'Errors'].map((h) => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: '24px', textAlign: 'center', color: '#4b6079', fontSize: '13px' }}>
                  No runs match the current filter.
                </td>
              </tr>
            ) : (
              runs.map((run) => <RunRow key={run.id} run={run} />)
            )}
          </tbody>
        </table>
      </div>
      {total > 50 && (
        <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', justifyContent: 'center' }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={btnStyle}>
            ‹ Prev
          </button>
          <span style={{ fontSize: '13px', alignSelf: 'center', color: '#94a3b8' }}>
            Page {page} of {Math.ceil(total / 50)}
          </span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page * 50 >= total} style={btnStyle}>
            Next ›
          </button>
        </div>
      )}
    </div>
  );
}

const btnStyle = {
  background: '#0d1f35', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px',
  padding: '4px 12px', fontSize: '13px', cursor: 'pointer', color: '#94a3b8',
};

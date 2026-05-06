import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchIngestionRuns, fetchIngestionRun } from '../../api/ingest';
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
        style={{ cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
        onMouseLeave={(e) => (e.currentTarget.style.background = '')}
      >
        <td style={TD}>{run.id}</td>
        <td style={TD}>{run.source_id}</td>
        <td style={TD}>{run.triggered_by || '—'}</td>
        <td style={TD}>{run.started_at ? format(parseISO(run.started_at), 'MMM d HH:mm') : '—'}</td>
        <td style={TD}>{duration != null ? `${duration}s` : '—'}</td>
        <td style={TD}><StatusBadge status={run.status} /></td>
        <td style={TD}>{run.records_fetched?.toLocaleString()}</td>
        <td style={TD}>{run.records_upserted?.toLocaleString()}</td>
        <td style={TD}>{run.changes_detected?.toLocaleString()}</td>
        <td style={{ ...TD, color: run.records_errored > 0 ? '#ef4444' : '#9ca3af' }}>
          {run.records_errored}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={10} style={{ padding: '0 16px 12px', background: '#f9fafb' }}>
            {!detail ? (
              <div style={{ fontSize: '12px', color: '#9ca3af', padding: '8px 0' }}>Loading...</div>
            ) : detail.errors?.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#6b7280', padding: '8px 0' }}>No errors for this run.</div>
            ) : (
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: '#374151' }}>
                  Errors ({detail.errors.length})
                </div>
                {detail.errors.slice(0, 20).map((e) => (
                  <div key={e.id} style={{
                    fontSize: '11px', padding: '4px 8px', background: '#fff',
                    border: '1px solid #fca5a5', borderRadius: '4px', marginBottom: '4px',
                    color: '#991b1b',
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

const TD = { padding: '8px 12px', fontSize: '13px', color: '#374151', whiteSpace: 'nowrap' };
const TH = { ...TD, background: '#f9fafb', fontWeight: 600, fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e5e7eb' };

export default function RunHistory() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['ingestionRuns', page],
    queryFn: () => fetchIngestionRuns({ page, page_size: 50 }),
    refetchInterval: 10_000,
  });

  if (isLoading) return <div style={{ padding: '20px', color: '#9ca3af', fontSize: '13px' }}>Loading run history...</div>;

  const runs = data?.items || [];
  const total = data?.total || 0;

  return (
    <div>
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
                <td colSpan={10} style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                  No ingestion runs yet. Click "Run All Sources" or "Run Now" on a source card.
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
          <span style={{ fontSize: '13px', alignSelf: 'center', color: '#6b7280' }}>
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
  background: '#fff', border: '1px solid #e5e7eb', borderRadius: '4px',
  padding: '4px 12px', fontSize: '13px', cursor: 'pointer', color: '#374151',
};

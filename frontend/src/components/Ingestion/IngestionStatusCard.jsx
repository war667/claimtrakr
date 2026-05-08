import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { triggerIngestionSource } from '../../api/ingest';
import { INGESTION_STATUS_COLORS } from '../../constants';
import { format, parseISO } from 'date-fns';

function StatusDot({ status }) {
  const color = INGESTION_STATUS_COLORS[status] || INGESTION_STATUS_COLORS.never;
  return (
    <span style={{
      display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%',
      background: color, marginRight: '6px', flexShrink: 0,
    }} />
  );
}

export default function IngestionStatusCard({ source }) {
  const qc = useQueryClient();

  const triggerMutation = useMutation({
    mutationFn: () => triggerIngestionSource(source.source_key),
    onSuccess: () => {
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['ingestionStatus'] });
        qc.invalidateQueries({ queryKey: ['ingestionRuns'] });
      }, 2000);
    },
  });

  const status = source.last_run_status || 'never';
  const color = INGESTION_STATUS_COLORS[status] || INGESTION_STATUS_COLORS.never;

  return (
    <div style={{
      background: '#0f2039',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '14px', color: '#ffffff' }}>
            {source.display_name}
          </div>
          <div style={{ fontSize: '11px', color: '#4b6079', marginTop: '2px' }}>
            {source.source_type} · key: {source.source_key}
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', background: color + '18',
          color, border: `1px solid ${color}44`, borderRadius: '9999px',
          padding: '3px 10px', fontSize: '12px', fontWeight: 600,
        }}>
          <StatusDot status={status} />
          {status === 'never' ? 'Never Run' : status.charAt(0).toUpperCase() + status.slice(1)}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
        <div>
          <div style={{ color: '#4b6079', fontSize: '11px', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Last Run</div>
          <div style={{ color: '#94a3b8' }}>
            {source.last_run_at
              ? format(parseISO(source.last_run_at), 'MMM d, yyyy HH:mm')
              : 'Never'}
          </div>
        </div>
        <div>
          <div style={{ color: '#4b6079', fontSize: '11px', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Records / Changes</div>
          <div style={{ color: '#94a3b8' }}>
            {source.last_records_fetched?.toLocaleString() || 0} / {source.last_changes_detected?.toLocaleString() || 0}
          </div>
        </div>
        {source.next_run_at && (
          <div>
            <div style={{ color: '#4b6079', fontSize: '11px', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Next Scheduled</div>
            <div style={{ color: '#94a3b8' }}>
              {format(parseISO(source.next_run_at), 'MMM d, HH:mm')} UTC
            </div>
          </div>
        )}
      </div>

      {source.last_error_summary && status === 'error' && (
        <div style={{
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: '6px',
          padding: '8px', fontSize: '12px', color: '#fca5a5',
        }}>
          {source.last_error_summary}
        </div>
      )}

      {source.source_type === 'arcgis_rest' && (
        <button
          onClick={() => triggerMutation.mutate()}
          disabled={triggerMutation.isPending}
          style={{
            background: triggerMutation.isPending ? '#334155' : '#2563eb',
            color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 14px',
            fontSize: '13px', cursor: triggerMutation.isPending ? 'default' : 'pointer',
            fontWeight: 600, alignSelf: 'flex-start',
          }}
        >
          {triggerMutation.isPending ? 'Triggered...' : '▶ Run Now'}
        </button>
      )}
    </div>
  );
}

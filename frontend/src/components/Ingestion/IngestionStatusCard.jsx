import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { triggerIngestionSource, fetchIngestionRunById } from '../../api/ingest';
import { INGESTION_STATUS_COLORS } from '../../constants';
import { format, parseISO, differenceInSeconds } from 'date-fns';

function StatusDot({ status }) {
  const color = INGESTION_STATUS_COLORS[status] || INGESTION_STATUS_COLORS.never;
  return (
    <span style={{
      display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%',
      background: color, marginRight: '6px', flexShrink: 0,
    }} />
  );
}

function Spinner() {
  const [frame, setFrame] = useState(0);
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % frames.length), 100);
    return () => clearInterval(t);
  }, []);
  return <span style={{ fontFamily: 'monospace', color: '#2563eb' }}>{frames[frame]}</span>;
}

function ElapsedTimer({ startedAt }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = startedAt ? new Date(startedAt) : new Date();
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return <span>{m > 0 ? `${m}m ` : ''}{s}s</span>;
}

export default function IngestionStatusCard({ source }) {
  const qc = useQueryClient();
  const [activeRunId, setActiveRunId] = useState(null);

  const triggerMutation = useMutation({
    mutationFn: () => triggerIngestionSource(source.source_key),
    onSuccess: (data) => {
      if (data.run_id) setActiveRunId(data.run_id);
    },
  });

  const { data: activeRun } = useQuery({
    queryKey: ['activeRun', activeRunId],
    queryFn: () => fetchIngestionRunById(activeRunId),
    enabled: !!activeRunId,
    refetchInterval: (data) => {
      if (!data || data.status === 'running') return 3000;
      return false;
    },
    onSuccess: (data) => {
      if (data.status !== 'running') {
        qc.invalidateQueries({ queryKey: ['ingestionStatus'] });
        qc.invalidateQueries({ queryKey: ['ingestionRuns'] });
      }
    },
  });

  const isRunning = activeRun?.status === 'running';
  const justFinished = activeRunId && activeRun && activeRun.status !== 'running';

  const status = source.last_run_status || 'never';
  const color = INGESTION_STATUS_COLORS[status] || INGESTION_STATUS_COLORS.never;

  return (
    <div style={{
      background: '#0f2039',
      border: `1px solid ${isRunning ? 'rgba(37,99,235,0.4)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: '12px',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      transition: 'border-color 0.3s',
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
          display: 'flex', alignItems: 'center',
          background: (isRunning ? '#2563eb' : color) + '18',
          color: isRunning ? '#2563eb' : color,
          border: `1px solid ${(isRunning ? '#2563eb' : color)}44`,
          borderRadius: '9999px',
          padding: '3px 10px', fontSize: '12px', fontWeight: 600,
        }}>
          {isRunning ? <><Spinner />&nbsp;Running</> : (
            <><StatusDot status={status} />{status === 'never' ? 'Never Run' : status.charAt(0).toUpperCase() + status.slice(1)}</>
          )}
        </div>
      </div>

      {/* Live progress block */}
      {isRunning && activeRun && (
        <div style={{
          background: 'rgba(37,99,235,0.08)',
          border: '1px solid rgba(37,99,235,0.2)',
          borderRadius: '8px',
          padding: '10px 12px',
          fontSize: '12px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: '#93c5fd', fontWeight: 600 }}>Run #{activeRun.id} in progress</span>
            <span style={{ color: '#4b6079' }}>
              <ElapsedTimer startedAt={activeRun.started_at} />
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
            {[
              ['Fetched', activeRun.records_fetched],
              ['Upserted', activeRun.records_upserted],
              ['Changes', activeRun.changes_detected],
            ].map(([label, val]) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>
                  {(val || 0).toLocaleString()}
                </div>
                <div style={{ fontSize: '10px', color: '#4b6079', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '8px', height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: '#2563eb', borderRadius: '2px',
              animation: 'progress-indeterminate 1.5s ease-in-out infinite',
              width: '40%',
            }} />
          </div>
          <style>{`
            @keyframes progress-indeterminate {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(350%); }
            }
          `}</style>
        </div>
      )}

      {/* Just finished */}
      {justFinished && (
        <div style={{
          background: activeRun.status === 'success' ? 'rgba(34,197,94,0.08)' : 'rgba(249,115,22,0.08)',
          border: `1px solid ${activeRun.status === 'success' ? 'rgba(34,197,94,0.25)' : 'rgba(249,115,22,0.25)'}`,
          borderRadius: '8px', padding: '8px 12px', fontSize: '12px',
        }}>
          <div style={{ color: activeRun.status === 'success' ? '#86efac' : '#fdba74', fontWeight: 600, marginBottom: '4px' }}>
            {activeRun.status === 'success' ? '✓ Complete' : '⚠ Finished with errors'}
          </div>
          <div style={{ color: '#94a3b8' }}>
            {activeRun.records_upserted?.toLocaleString()} upserted · {activeRun.changes_detected?.toLocaleString()} changes · {activeRun.records_errored} errors
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
        <div>
          <div style={{ color: '#4b6079', fontSize: '11px', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Last Run</div>
          <div style={{ color: '#94a3b8' }}>
            {source.last_run_at ? format(parseISO(source.last_run_at), 'MMM d, yyyy HH:mm') : 'Never'}
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
            <div style={{ color: '#94a3b8' }}>{format(parseISO(source.next_run_at), 'MMM d, HH:mm')} UTC</div>
          </div>
        )}
      </div>

      {source.last_error_summary && status === 'error' && !isRunning && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: '6px', padding: '8px', fontSize: '12px', color: '#fca5a5',
        }}>
          {source.last_error_summary}
        </div>
      )}

      {source.source_type === 'arcgis_rest' && (
        <button
          onClick={() => { setActiveRunId(null); triggerMutation.mutate(); }}
          disabled={triggerMutation.isPending || isRunning}
          style={{
            background: (triggerMutation.isPending || isRunning) ? '#334155' : '#2563eb',
            color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 14px',
            fontSize: '13px', cursor: (triggerMutation.isPending || isRunning) ? 'default' : 'pointer',
            fontWeight: 600, alignSelf: 'flex-start',
          }}
        >
          {isRunning ? 'Running...' : triggerMutation.isPending ? 'Starting...' : '▶ Run Now'}
        </button>
      )}
    </div>
  );
}

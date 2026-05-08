import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchIngestionStatus, triggerIngestionAll } from '../api/ingest';
import useIsMobile from '../hooks/useIsMobile';
import IngestionStatusCard from '../components/Ingestion/IngestionStatusCard';
import RunHistory from '../components/Ingestion/RunHistory';
import ManualUpload from '../components/Ingestion/ManualUpload';

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '28px' }}>
      <h2 style={{
        margin: '0 0 14px', fontSize: '11px', fontWeight: 600,
        color: '#06b6d4', textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

export default function IngestionPage() {
  const qc = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ['ingestionStatus'],
    queryFn: fetchIngestionStatus,
    refetchInterval: 15_000,
  });

  const triggerAllMutation = useMutation({
    mutationFn: triggerIngestionAll,
    onSuccess: () => {
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['ingestionStatus'] });
        qc.invalidateQueries({ queryKey: ['ingestionRuns'] });
      }, 2000);
    },
  });

  const sources = status?.sources || [];
  const isMobile = useIsMobile();
  const pad = isMobile ? '12px' : '24px';

  return (
    <div style={{ padding: pad, maxWidth: '1000px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: 700, color: '#ffffff' }}>Data Ingestion</h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
            Pull live mining claim data from BLM ArcGIS REST services
          </p>
        </div>
        <button
          onClick={() => triggerAllMutation.mutate()}
          disabled={triggerAllMutation.isPending}
          style={{
            background: triggerAllMutation.isPending ? '#334155' : '#2563eb',
            color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 20px',
            fontSize: '14px', cursor: triggerAllMutation.isPending ? 'default' : 'pointer',
            fontWeight: 700,
          }}
        >
          {triggerAllMutation.isPending ? 'Triggering...' : '▶▶ Run All Sources'}
        </button>
      </div>

      {triggerAllMutation.isSuccess && (
        <div style={{
          background: 'rgba(34,197,94,0.1)',
          border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: '8px',
          padding: '10px 16px', marginBottom: '16px', fontSize: '13px', color: '#86efac',
        }}>
          ✓ Ingestion started as background task. Results will appear in Run History below.
        </div>
      )}

      <Section title="Sources">
        {isLoading ? (
          <div style={{ color: '#4b6079', fontSize: '13px' }}>Loading sources...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {sources.map((source) => (
              <IngestionStatusCard key={source.source_key} source={source} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Run History">
        <div style={{
          background: '#0f2039',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          overflow: 'hidden',
        }}>
          <RunHistory />
        </div>
      </Section>

      <Section title="Manual Upload">
        <div style={{
          background: '#0f2039',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          padding: '20px',
        }}>
          <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#94a3b8' }}>
            Upload a CSV or GeoJSON file with claim data. Use this as a fallback if the BLM endpoint
            is unavailable. Fields should match the schema (serial_nr, case_status, state, county, etc.)
          </p>
          <ManualUpload />
        </div>
      </Section>
    </div>
  );
}

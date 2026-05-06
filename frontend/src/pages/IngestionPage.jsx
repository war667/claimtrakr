import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchIngestionStatus, triggerIngestionAll } from '../api/ingest';
import IngestionStatusCard from '../components/Ingestion/IngestionStatusCard';
import RunHistory from '../components/Ingestion/RunHistory';
import ManualUpload from '../components/Ingestion/ManualUpload';

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '28px' }}>
      <h2 style={{ margin: '0 0 14px', fontSize: '15px', fontWeight: 700, color: '#111827' }}>{title}</h2>
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

  return (
    <div style={{ padding: '24px', maxWidth: '1000px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: 700 }}>Data Ingestion</h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
            Pull live mining claim data from BLM ArcGIS REST services
          </p>
        </div>
        <button
          onClick={() => triggerAllMutation.mutate()}
          disabled={triggerAllMutation.isPending}
          style={{
            background: triggerAllMutation.isPending ? '#9ca3af' : '#1e293b',
            color: '#fff', border: 'none', borderRadius: '6px', padding: '9px 20px',
            fontSize: '14px', cursor: triggerAllMutation.isPending ? 'default' : 'pointer',
            fontWeight: 700,
          }}
        >
          {triggerAllMutation.isPending ? 'Triggering...' : '▶▶ Run All Sources'}
        </button>
      </div>

      {triggerAllMutation.isSuccess && (
        <div style={{
          background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px',
          padding: '10px 16px', marginBottom: '16px', fontSize: '13px', color: '#166534',
        }}>
          ✓ Ingestion started as background task. Results will appear in Run History below.
        </div>
      )}

      <Section title="Sources">
        {isLoading ? (
          <div style={{ color: '#9ca3af', fontSize: '13px' }}>Loading sources...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {sources.map((source) => (
              <IngestionStatusCard key={source.source_key} source={source} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Run History">
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
          <RunHistory />
        </div>
      </Section>

      <Section title="Manual Upload">
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px' }}>
          <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#6b7280' }}>
            Upload a CSV or GeoJSON file with claim data. Use this as a fallback if the BLM endpoint
            is unavailable. Fields should match the schema (serial_nr, case_status, state, county, etc.)
          </p>
          <ManualUpload />
        </div>
      </Section>
    </div>
  );
}

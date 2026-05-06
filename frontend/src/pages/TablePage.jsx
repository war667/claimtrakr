import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchTargets } from '../api/targets';
import ClaimsTable from '../components/Claims/ClaimsTable';
import ClaimDetailPanel from '../components/Claims/ClaimDetailPanel';
import { CLAIM_TYPES } from '../constants';
import client from '../api/client';

const STATES = ['UT', 'NV'];

function FilterBar({ filters, onChange, onReset }) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '10px', padding: '12px 16px',
      background: '#fff', borderBottom: '1px solid #e5e7eb', alignItems: 'flex-end',
    }}>
      <div>
        <label style={labelStyle}>State</label>
        <select value={filters.state || ''} onChange={(e) => onChange({ ...filters, state: e.target.value || undefined })} style={selectStyle}>
          <option value="">All</option>
          {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Status</label>
        <select value={filters.status || ''} onChange={(e) => onChange({ ...filters, status: e.target.value || undefined })} style={selectStyle}>
          <option value="">All</option>
          <option value="ACTIVE">Active</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>
      <div>
        <label style={labelStyle}>Claim Type</label>
        <select value={filters.claim_type || ''} onChange={(e) => onChange({ ...filters, claim_type: e.target.value || undefined })} style={selectStyle}>
          <option value="">All</option>
          {CLAIM_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Closed Within</label>
        <select value={filters.closed_within_days || ''} onChange={(e) => onChange({ ...filters, closed_within_days: e.target.value ? parseInt(e.target.value) : undefined })} style={selectStyle}>
          <option value="">Any</option>
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="180">180 days</option>
        </select>
      </div>
      <div>
        <label style={labelStyle}>Search Claimant</label>
        <input
          type="text"
          value={filters.search || ''}
          onChange={(e) => onChange({ ...filters, search: e.target.value || undefined })}
          placeholder="Fuzzy search..."
          style={{ ...selectStyle, width: '160px' }}
        />
      </div>
      <button onClick={onReset} style={{
        background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '4px',
        padding: '5px 12px', fontSize: '13px', cursor: 'pointer', color: '#374151',
      }}>
        Reset
      </button>
    </div>
  );
}

const labelStyle = { fontSize: '11px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '3px', textTransform: 'uppercase' };
const selectStyle = { padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: '4px', fontSize: '13px', background: '#fff' };

export default function TablePage() {
  const [filters, setFilters] = useState({});
  const [selectedClaim, setSelectedClaim] = useState(null);

  const { data: targetsData } = useQuery({
    queryKey: ['targets', 'allSerials'],
    queryFn: () => fetchTargets({ page_size: 500 }),
    staleTime: 60_000,
  });
  const targetSerialNrs = (targetsData?.items || []).map((t) => t.serial_nr);

  const handleExport = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v != null) params.append(k, v); });
    const authStr = btoa(`${import.meta.env.VITE_AUTH_USER || 'admin'}:${import.meta.env.VITE_AUTH_PASS || 'changeme'}`);
    const url = `${import.meta.env.VITE_API_URL || ''}/api/v1/exports/claims.csv?${params}`;
    // Build a link with auth — open in new tab, browser will handle basic auth prompt
    window.open(url, '_blank');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <FilterBar filters={filters} onChange={setFilters} onReset={() => setFilters({})} />
      <div style={{ flex: 1, overflow: 'auto' }}>
        <ClaimsTable
          filters={filters}
          targetSerialNrs={targetSerialNrs}
          onRowClick={setSelectedClaim}
          onExport={handleExport}
        />
      </div>
      {selectedClaim && (
        <ClaimDetailPanel
          claim={selectedClaim}
          onClose={() => setSelectedClaim(null)}
        />
      )}
    </div>
  );
}

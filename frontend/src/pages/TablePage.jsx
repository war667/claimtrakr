import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { fetchTargets } from '../api/targets';
import ClaimsTable from '../components/Claims/ClaimsTable';
import ClaimDetailPanel from '../components/Claims/ClaimDetailPanel';
import { CLAIM_TYPES } from '../constants';
import client from '../api/client';

const STATES = ['UT', 'NV'];

const PRESETS = ['', '1', '7', '30', '90', '180', 'custom'];

function DaysFilter({ label, value, onChange: onChangeProp }) {
  const [showCustom, setShowCustom] = useState(false);
  const [customVal, setCustomVal] = useState('');
  const inputRef = useRef(null);

  const currentPreset = value ? (PRESETS.includes(String(value)) && String(value) !== '' ? String(value) : 'custom') : '';

  const handleSelect = (e) => {
    const v = e.target.value;
    if (v === 'custom') {
      setShowCustom(true);
      setCustomVal(value && !PRESETS.slice(1, -1).includes(String(value)) ? String(value) : '');
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setShowCustom(false);
      onChangeProp(v ? parseInt(v) : undefined);
    }
  };

  const handleCustomCommit = () => {
    const n = parseInt(customVal);
    if (n > 0) onChangeProp(n);
    else { setShowCustom(false); onChangeProp(undefined); }
  };

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <select value={currentPreset} onChange={handleSelect} style={selectStyle}>
          <option value="">Any</option>
          <option value="1">1 day</option>
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="180">180 days</option>
          <option value="custom">Custom…</option>
        </select>
        {showCustom && (
          <input
            ref={inputRef}
            type="number"
            min="1"
            value={customVal}
            onChange={(e) => setCustomVal(e.target.value)}
            onBlur={handleCustomCommit}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCustomCommit(); if (e.key === 'Escape') { setShowCustom(false); onChangeProp(undefined); } }}
            placeholder="days"
            style={{ ...selectStyle, width: '64px' }}
          />
        )}
      </div>
    </div>
  );
}

function FilterBar({ filters, onChange, onReset }) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '10px', padding: '12px 16px',
      background: '#0f2039',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      alignItems: 'flex-end',
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
      <DaysFilter
        label="Closed Within"
        value={filters.closed_within_days}
        onChange={(v) => onChange({ ...filters, closed_within_days: v })}
      />
      <DaysFilter
        label="Changed Within"
        value={filters.changed_within_days}
        onChange={(v) => onChange({ ...filters, changed_within_days: v })}
      />
      <div>
        <label style={labelStyle}>Search</label>
        <input
          type="text"
          value={filters.search || ''}
          onChange={(e) => onChange({ ...filters, search: e.target.value || undefined })}
          placeholder="Serial #, claimant, name..."
          style={{ ...selectStyle, width: '190px' }}
        />
      </div>
      <button onClick={onReset} style={{
        background: '#0d1f35',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '6px',
        padding: '5px 12px', fontSize: '13px', cursor: 'pointer', color: '#94a3b8',
      }}>
        Reset
      </button>
    </div>
  );
}

const labelStyle = {
  fontSize: '11px', fontWeight: 600, color: '#06b6d4',
  display: 'block', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.04em',
};
const selectStyle = {
  padding: '5px 8px',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '6px',
  fontSize: '13px',
  background: '#0d1f35',
  color: '#ffffff',
};

export default function TablePage() {
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => {
    const f = {};
    if (searchParams.get('search')) f.search = searchParams.get('search');
    if (searchParams.get('status')) f.status = searchParams.get('status');
    if (searchParams.get('closed_within_days')) f.closed_within_days = parseInt(searchParams.get('closed_within_days'));
    if (searchParams.get('changed_within_days')) f.changed_within_days = parseInt(searchParams.get('changed_within_days'));
    if (searchParams.get('state')) f.state = searchParams.get('state');
    return f;
  });
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
    const url = `/api/v1/exports/claims.csv?${params}`;
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

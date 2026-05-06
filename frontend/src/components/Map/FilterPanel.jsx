import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCounties } from '../../api/reference';
import { CLAIM_TYPES } from '../../constants';

export default function FilterPanel({ filters, onChange, onApply, onReset }) {
  const [collapsed, setCollapsed] = useState(false);
  const [countySearch, setCountySearch] = useState('');

  const { data: counties = [] } = useQuery({
    queryKey: ['counties'],
    queryFn: fetchCounties,
  });

  const filteredCounties = counties
    .filter((c) => !filters.state || filters.state === 'Both' || c.state === filters.state)
    .filter((c) => !countySearch || c.county.toLowerCase().includes(countySearch.toLowerCase()))
    .slice(0, 50);

  if (collapsed) {
    return (
      <div style={{
        position: 'absolute', top: '80px', left: '10px', zIndex: 1000,
        background: '#fff', borderRadius: '6px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        padding: '8px',
      }}>
        <button onClick={() => setCollapsed(false)} style={btnStyle}>
          ☰ Filters
        </button>
      </div>
    );
  }

  return (
    <div style={{
      position: 'absolute', top: '80px', left: '10px', zIndex: 1000,
      background: '#fff', borderRadius: '8px', boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
      width: '260px', padding: '14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
        <strong style={{ fontSize: '13px' }}>Filters</strong>
        <button onClick={() => setCollapsed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '18px' }}>
          ‹
        </button>
      </div>

      <FilterSection label="State">
        <ButtonGroup
          options={[{ k: 'UT', l: 'UT' }, { k: 'NV', l: 'NV' }, { k: '', l: 'Both' }]}
          value={filters.state || ''}
          onChange={(v) => onChange({ ...filters, state: v })}
        />
      </FilterSection>

      <FilterSection label="Status">
        <ButtonGroup
          options={[{ k: 'ACTIVE', l: 'Active' }, { k: 'CLOSED', l: 'Closed' }, { k: '', l: 'Both' }]}
          value={filters.status || ''}
          onChange={(v) => onChange({ ...filters, status: v })}
        />
      </FilterSection>

      <FilterSection label="Closed Within">
        <ButtonGroup
          options={[
            { k: '7', l: '7d' }, { k: '30', l: '30d' },
            { k: '90', l: '90d' }, { k: '180', l: '180d' }, { k: '', l: 'All' },
          ]}
          value={filters.closed_within_days ? String(filters.closed_within_days) : ''}
          onChange={(v) => onChange({ ...filters, closed_within_days: v ? parseInt(v) : undefined })}
        />
      </FilterSection>

      <FilterSection label="Claim Types">
        {CLAIM_TYPES.map((ct) => (
          <label key={ct} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginBottom: '4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={(filters.claim_types || []).includes(ct)}
              onChange={(e) => {
                const current = filters.claim_types || [];
                onChange({
                  ...filters,
                  claim_type: e.target.checked
                    ? ct
                    : current.filter((x) => x !== ct)[0] || undefined,
                });
              }}
            />
            {ct.replace(/_/g, ' ')}
          </label>
        ))}
      </FilterSection>

      <FilterSection label="County">
        <input
          type="text"
          placeholder="Search county..."
          value={countySearch}
          onChange={(e) => setCountySearch(e.target.value)}
          style={{
            width: '100%', padding: '4px 8px', border: '1px solid #e5e7eb',
            borderRadius: '4px', fontSize: '12px', marginBottom: '4px',
          }}
        />
        <select
          value={filters.county || ''}
          onChange={(e) => onChange({ ...filters, county: e.target.value || undefined })}
          style={{ width: '100%', padding: '4px', border: '1px solid #e5e7eb', borderRadius: '4px', fontSize: '12px' }}
        >
          <option value="">All counties</option>
          {filteredCounties.map((c) => (
            <option key={`${c.state}-${c.county}`} value={c.county}>
              {c.state}: {c.county} ({c.total_count})
            </option>
          ))}
        </select>
      </FilterSection>

      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button onClick={onApply} style={{ ...btnStyle, flex: 1, background: '#1e293b', color: '#fff' }}>
          Apply
        </button>
        <button onClick={onReset} style={{ ...btnStyle, flex: 1, background: '#f3f4f6', color: '#374151' }}>
          Reset
        </button>
      </div>
    </div>
  );
}

function FilterSection({ label, children }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function ButtonGroup({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {options.map(({ k, l }) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          style={{
            padding: '3px 10px', fontSize: '12px', borderRadius: '4px', cursor: 'pointer', border: '1px solid #e5e7eb',
            background: value === k ? '#1e293b' : '#fff',
            color: value === k ? '#fff' : '#374151',
            fontWeight: value === k ? 600 : 400,
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

const btnStyle = {
  padding: '6px 12px', fontSize: '13px', borderRadius: '5px', cursor: 'pointer', border: '1px solid #e5e7eb',
};

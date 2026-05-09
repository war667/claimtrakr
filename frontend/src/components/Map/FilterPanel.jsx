import React, { useState } from 'react';
import { CLAIM_TYPES } from '../../constants';

export default function FilterPanel({ filters, onChange, onReset }) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div style={{
        position: 'absolute', top: '80px', left: '10px', zIndex: 1000,
        background: '#0d1f35', borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
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
      background: '#0d1f35',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '12px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      width: '260px', padding: '14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
        <strong style={{ fontSize: '13px', color: '#ffffff' }}>Filters</strong>
        <button
          onClick={() => setCollapsed(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '18px' }}
        >
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
          <label key={ct} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '12px', marginBottom: '4px', cursor: 'pointer', color: '#94a3b8',
          }}>
            <input
              type="checkbox"
              checked={(filters.claim_types || []).includes(ct)}
              onChange={(e) => {
                const current = filters.claim_types || [];
                const updated = e.target.checked
                  ? [...current, ct]
                  : current.filter((x) => x !== ct);
                onChange({ ...filters, claim_types: updated.length ? updated : undefined });
              }}
              style={{ accentColor: '#2563eb' }}
            />
            {ct.replace(/_/g, ' ')}
          </label>
        ))}
      </FilterSection>

      <div style={{ marginTop: '12px' }}>
        <button onClick={onReset} style={{ ...btnStyle, width: '100%', background: '#0a1628', color: '#94a3b8' }}>
          Reset Filters
        </button>
      </div>
    </div>
  );
}

function FilterSection({ label, children }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{
        fontSize: '11px', fontWeight: 600, color: '#06b6d4',
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px',
      }}>
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
            padding: '3px 10px', fontSize: '12px', borderRadius: '6px', cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.1)',
            background: value === k ? '#2563eb' : '#0a1628',
            color: value === k ? '#ffffff' : '#94a3b8',
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
  padding: '6px 12px', fontSize: '13px', borderRadius: '6px', cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.12)',
};

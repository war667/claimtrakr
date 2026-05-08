import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { WORKFLOW_STATUSES } from '../constants';
import TargetList from '../components/Targets/TargetList';

export default function TargetsPage() {
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => {
    const f = {};
    if (searchParams.get('workflow_status')) f.workflow_status = searchParams.get('workflow_status');
    if (searchParams.get('state')) f.state = searchParams.get('state');
    return f;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Filter bar */}
      <div style={{
        display: 'flex', gap: '10px', flexWrap: 'wrap', padding: '12px 16px',
        background: '#0f2039',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        alignItems: 'flex-end',
      }}>
        <div>
          <label style={labelStyle}>Workflow Status</label>
          <select
            value={filters.workflow_status || ''}
            onChange={(e) => setFilters((f) => ({ ...f, workflow_status: e.target.value || undefined }))}
            style={selectStyle}
          >
            <option value="">All statuses</option>
            {WORKFLOW_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>State</label>
          <select
            value={filters.state || ''}
            onChange={(e) => setFilters((f) => ({ ...f, state: e.target.value || undefined }))}
            style={selectStyle}
          >
            <option value="">All</option>
            <option value="UT">UT</option>
            <option value="NV">NV</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Assigned To</label>
          <input
            type="text"
            value={filters.assigned_to || ''}
            onChange={(e) => setFilters((f) => ({ ...f, assigned_to: e.target.value || undefined }))}
            placeholder="Username..."
            style={{ ...selectStyle, width: '140px' }}
          />
        </div>
        <button
          onClick={() => setFilters({})}
          style={{
            background: '#0d1f35',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px',
            padding: '5px 12px', fontSize: '13px', cursor: 'pointer', color: '#94a3b8',
          }}
        >
          Reset
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <TargetList filters={filters} />
      </div>
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

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchClaims } from '../../api/claims';
import StatusBadge from './StatusBadge';
import EmptyState from '../shared/EmptyState';

const COL_STYLE = {
  padding: '8px 12px',
  textAlign: 'left',
  fontSize: '13px',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '180px',
  color: '#94a3b8',
};

const TH_STYLE = {
  ...COL_STYLE,
  background: '#0d1f35',
  fontWeight: 600,
  fontSize: '11px',
  color: '#06b6d4',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  cursor: 'pointer',
  userSelect: 'none',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
};

export default function ClaimsTable({ filters, targetSerialNrs = [], onRowClick, onExport }) {
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('last_seen_at');
  const [sortDir, setSortDir] = useState('desc');
  const PAGE_SIZE = 100;

  const { data, isLoading, error } = useQuery({
    queryKey: ['claims', filters, page, sortBy, sortDir],
    queryFn: () => fetchClaims({ ...filters, page, page_size: PAGE_SIZE, sort_by: sortBy, sort_dir: sortDir }),
    keepPreviousData: true,
  });

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
    setPage(1);
  };

  const sortIndicator = (col) => (sortBy === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

  if (isLoading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#4b6079' }}>Loading claims...</div>
  );
  if (error) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>
      Error loading claims: {error.message}
    </div>
  );

  const items = data?.items || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (items.length === 0) return (
    <EmptyState
      icon="📋"
      title="No claims found"
      message="No claims ingested yet. Go to the Ingestion page to pull data from BLM sources."
    />
  );

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: '#0f2039',
      }}>
        <span style={{ fontSize: '13px', color: '#94a3b8' }}>
          {total.toLocaleString()} claim{total !== 1 ? 's' : ''}
        </span>
        <button
          onClick={onExport}
          style={{
            background: '#0d1f35',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '6px',
            padding: '4px 12px',
            fontSize: '12px',
            cursor: 'pointer',
            color: '#94a3b8',
          }}
        >
          ⬇ Export CSV
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              {[
                ['serial_nr', 'Serial #'],
                ['claim_name', 'Claim Name'],
                ['claimant_name', 'Claimant'],
                ['county', 'County'],
                ['state', 'State'],
                ['claim_type', 'Type'],
                ['case_status', 'Status'],
                ['last_seen_at', 'Last Seen'],
                ['acres', 'Acres'],
              ].map(([col, label]) => (
                <th key={col} style={TH_STYLE} onClick={() => handleSort(col)}>
                  {label}{sortIndicator(col)}
                </th>
              ))}
              <th style={TH_STYLE}>In Targets?</th>
            </tr>
          </thead>
          <tbody>
            {items.map((claim) => (
              <tr
                key={claim.serial_nr}
                onClick={() => onRowClick(claim)}
                style={{ cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#0d1f35')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
              >
                <td style={{ ...COL_STYLE, fontFamily: 'monospace', fontSize: '12px', color: '#2563eb' }}>
                  {claim.serial_nr}
                </td>
                <td style={{ ...COL_STYLE, color: '#ffffff' }}>{claim.claim_name || '—'}</td>
                <td style={COL_STYLE}>{claim.claimant_name || '—'}</td>
                <td style={COL_STYLE}>{claim.county || '—'}</td>
                <td style={COL_STYLE}>{claim.state || '—'}</td>
                <td style={COL_STYLE}>{claim.claim_type || '—'}</td>
                <td style={COL_STYLE}>
                  <StatusBadge status={claim.case_status} closedDt={claim.closed_dt} />
                </td>
                <td style={COL_STYLE}>{claim.last_seen_at ? claim.last_seen_at.slice(0, 10) : '—'}</td>
                <td style={COL_STYLE}>
                  {claim.acres ? Number(claim.acres).toFixed(1) : '—'}
                </td>
                <td style={{ ...COL_STYLE, textAlign: 'center' }}>
                  {targetSerialNrs.includes(claim.serial_nr) ? (
                    <span style={{ color: '#22c55e', fontSize: '16px' }}>✓</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{
        display: 'flex', gap: '8px', alignItems: 'center',
        padding: '12px 16px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        background: '#0f2039',
        justifyContent: 'center',
      }}>
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          style={paginationBtn(page === 1)}
        >
          ‹ Prev
        </button>
        {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
          const p = page <= 4 ? i + 1 : page - 3 + i;
          if (p < 1 || p > totalPages) return null;
          return (
            <button
              key={p}
              onClick={() => setPage(p)}
              style={paginationBtn(false, p === page)}
            >
              {p}
            </button>
          );
        })}
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          style={paginationBtn(page >= totalPages)}
        >
          Next ›
        </button>
        <span style={{ fontSize: '12px', color: '#4b6079' }}>
          Page {page} of {totalPages}
        </span>
      </div>
    </div>
  );
}

function paginationBtn(disabled, active = false) {
  return {
    background: active ? '#2563eb' : '#0d1f35',
    color: active ? '#ffffff' : disabled ? '#334155' : '#94a3b8',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '6px',
    padding: '4px 10px',
    fontSize: '13px',
    cursor: disabled ? 'default' : 'pointer',
  };
}

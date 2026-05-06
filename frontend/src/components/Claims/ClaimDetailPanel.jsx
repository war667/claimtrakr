import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTarget } from '../../api/targets';
import StatusBadge from './StatusBadge';
import ClaimEventLog from './ClaimEventLog';

function Field({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ marginBottom: '8px' }}>
      <dt style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
        {label}
      </dt>
      <dd style={{ margin: 0, fontSize: '13px', color: '#111827', wordBreak: 'break-word' }}>
        {value}
      </dd>
    </div>
  );
}

export default function ClaimDetailPanel({ claim, onClose }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [rawOpen, setRawOpen] = useState(false);
  const [addedMsg, setAddedMsg] = useState('');

  const addTargetMutation = useMutation({
    mutationFn: () => createTarget({ serial_nr: claim.serial_nr }),
    onSuccess: (newTarget) => {
      qc.invalidateQueries({ queryKey: ['targets'] });
      navigate(`/targets/${newTarget.id}`);
    },
    onError: () => setAddedMsg('Error adding target'),
  });

  if (!claim) return null;

  const isClosed = claim.case_status === 'CLOSED';

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      width: '380px',
      height: '100vh',
      background: '#ffffff',
      boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Serial #</div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>
            {claim.serial_nr}
          </div>
          <div style={{ marginTop: '6px' }}>
            <StatusBadge status={claim.case_status} closedDt={claim.closed_dt} />
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#6b7280', fontSize: '20px', padding: '0', lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {isClosed && (
          <div style={{
            background: '#fff7ed',
            border: '1px solid #f97316',
            borderRadius: '6px',
            padding: '12px',
            marginBottom: '16px',
            fontSize: '12px',
            color: '#9a3412',
          }}>
            ⚠️ <strong>This claim shows as CLOSED.</strong> This does{' '}
            <strong>NOT</strong> mean the area is open to mineral location. Do not
            stake without completing full due-diligence including land-status,
            withdrawal, active-overlap, surface ownership, and legal review.
          </div>
        )}

        <dl>
          {claim.blm_url ? (
            <div style={{ marginBottom: '8px' }}>
              <dt style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                BLM Record
              </dt>
              <dd style={{ margin: 0 }}>
                <a href={claim.blm_url} target="_blank" rel="noopener noreferrer"
                   style={{ fontSize: '13px', color: '#2563eb' }}>
                  {claim.serial_nr} ↗
                </a>
              </dd>
            </div>
          ) : null}
          <Field label="Claim Name" value={claim.claim_name} />
          <Field label="Claim Type" value={claim.claim_type} />
          <Field label="Claimant" value={claim.claimant_name} />
          <Field label="State / County" value={[claim.state, claim.county].filter(Boolean).join(' / ')} />
          <Field label="Township / Range / Section"
            value={[claim.township, claim.range_ || claim.range, claim.section].filter(Boolean).join(' / ')} />
          <Field label="Meridian" value={claim.meridian} />
          <Field label="Acres" value={claim.acres ? Number(claim.acres).toFixed(2) : null} />
          <Field label="Disposition Code"
            value={claim.disposition_cd && claim.disposition_desc
              ? `${claim.disposition_cd} — ${claim.disposition_desc}`
              : claim.disposition_cd} />
          <Field label="Location Date" value={claim.location_dt} />
          {isClosed && <Field label="Closed Date" value={claim.closed_dt} />}
          <Field label="Geometry Confidence" value={claim.geom_confidence} />
          <Field label="First Seen" value={claim.first_seen_at ? claim.first_seen_at.split('T')[0] : null} />
          <Field label="Last Updated" value={claim.last_seen_at ? claim.last_seen_at.split('T')[0] : null} />
        </dl>

        <div style={{ margin: '16px 0', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
          <h4 style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>
            Recent Events
          </h4>
          <ClaimEventLog serialNr={claim.serial_nr} maxItems={5} />
        </div>

        <button
          onClick={() => setRawOpen((v) => !v)}
          style={{
            background: 'none', border: '1px solid #e5e7eb', borderRadius: '4px',
            padding: '4px 10px', fontSize: '12px', cursor: 'pointer', color: '#6b7280',
            marginBottom: '12px',
          }}
        >
          {rawOpen ? '▲ Hide' : '▼ View'} Raw Source Data
        </button>
        {rawOpen && (
          <pre style={{
            background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '4px',
            padding: '10px', fontSize: '11px', overflow: 'auto', maxHeight: '200px',
            color: '#374151', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {JSON.stringify(claim.raw_json, null, 2)}
          </pre>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid #e5e7eb',
        display: 'flex',
        gap: '8px',
      }}>
        <button
          onClick={() => addTargetMutation.mutate()}
          disabled={addTargetMutation.isPending}
          style={{
            flex: 1,
            background: '#1e293b', color: '#f1f5f9',
            border: 'none', borderRadius: '6px', padding: '8px 12px',
            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          }}
        >
          {addTargetMutation.isPending ? 'Adding...' : '🎯 Add to Targets'}
        </button>
        {addedMsg && <span style={{ color: '#ef4444', fontSize: '12px', alignSelf: 'center' }}>{addedMsg}</span>}
      </div>
    </div>
  );
}

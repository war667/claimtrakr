import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createTarget } from '../../api/targets';
import { fetchClaimRaw } from '../../api/claims';
import StatusBadge from './StatusBadge';
import ClaimEventLog from './ClaimEventLog';
import useIsMobile from '../../hooks/useIsMobile';

const RAW_FIELD_LABELS = {
  CSE_NR: 'Serial #', CSE_NAME: 'Claim Name', BLM_PROD: 'Claim Type',
  CSE_DISP: 'Status', ADMIN_STATE: 'State', RCRD_ACRS: 'Acres',
  SF_ID: 'Salesforce ID', OBJECTID: 'Object ID', SRC: 'Source',
  QLTY: 'Quality / Notes', CSE_META: 'Legal Description',
  GEO_STATE: 'Geo State', LEG_CSE_NR: 'Legacy Case #',
  CSE_TYPE_NR: 'Case Type #', MC_CONVEYED: 'Conveyed',
  MC_EXCLUDED: 'Excluded', MC_PATENTED: 'Patented',
  REC_TYPE_CSE_GRP: 'Record Type',
  CASE_SERIAL_NR: 'Serial #', CASE_NM: 'Claim Name', CASE_TYPE: 'Type',
  CASE_STATUS: 'Status', CLAIMANT_NM: 'Claimant', CLAIMANT_ADDR: 'Address',
  ADMIN_ST: 'State', COUNTY_NM: 'County', MERIDIAN: 'Meridian',
  TOWNSHIP: 'Township', RANGE: 'Range', SECTION: 'Section',
  ALIQUOT: 'Aliquot', GIS_ACRES: 'Acres', DISP_CD: 'Disposition Code',
  DISP_DESC: 'Disposition', LOCATION_DT: 'Location Date',
  FILING_DT: 'Filing Date', CLOSE_DT: 'Close Date',
  LAST_ACTION_DT: 'Last Action', TOWNSHIP_DIR: 'Twp Dir', RANGE_DIR: 'Rng Dir',
};

function Field({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ marginBottom: '10px' }}>
      <dt style={{
        fontSize: '10px', color: '#06b6d4', textTransform: 'uppercase',
        letterSpacing: '0.06em', marginBottom: '2px', fontWeight: 600,
      }}>
        {label}
      </dt>
      <dd style={{ margin: 0, fontSize: '13px', color: '#ffffff', wordBreak: 'break-word' }}>
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

  const isMobile = useIsMobile();

  const { data: rawRecord, isLoading: rawLoading } = useQuery({
    queryKey: ['claimRaw', claim.serial_nr],
    queryFn: () => fetchClaimRaw(claim.serial_nr),
    enabled: rawOpen && !claim.raw_json,
    staleTime: 300_000,
  });

  const rawData = claim.raw_json ?? rawRecord?.raw_json;

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
      width: isMobile ? '100vw' : '380px',
      height: '100vh',
      background: '#0f2039',
      borderLeft: '1px solid rgba(255,255,255,0.08)',
      boxShadow: '-4px 0 32px rgba(0,0,0,0.5)',
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        background: '#0d1f35',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '10px', color: '#06b6d4', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
            Serial #
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
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
            color: '#94a3b8', fontSize: '20px', padding: '0', lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {isClosed && (
          <div style={{
            background: 'rgba(249,115,22,0.1)',
            border: '1px solid rgba(249,115,22,0.3)',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '16px',
            fontSize: '12px',
            color: '#fdba74',
          }}>
            ⚠️ <strong>This claim shows as CLOSED.</strong> This does{' '}
            <strong>NOT</strong> mean the area is open to mineral location. Do not
            stake without completing full due-diligence including land-status,
            withdrawal, active-overlap, surface ownership, and legal review.
          </div>
        )}

        <dl>
          {claim.blm_url ? (
            <div style={{ marginBottom: '10px' }}>
              <dt style={{ fontSize: '10px', color: '#06b6d4', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px', fontWeight: 600 }}>
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

        <div style={{ margin: '16px 0', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
          <h4 style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: 600, color: '#06b6d4', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Recent Events
          </h4>
          <ClaimEventLog serialNr={claim.serial_nr} maxItems={5} />
        </div>

        <button
          onClick={() => setRawOpen((v) => !v)}
          style={{
            background: 'none',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px',
            padding: '4px 10px', fontSize: '12px', cursor: 'pointer', color: '#94a3b8',
            marginBottom: '12px',
          }}
        >
          {rawOpen ? '▲ Hide' : '▼ View'} Raw Source Data
        </button>
        {rawOpen && (
          <div style={{
            background: '#080f1e',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '6px',
            padding: '10px', fontSize: '11px', overflow: 'auto', maxHeight: '260px',
          }}>
            {rawLoading ? (
              <span style={{ color: '#4b6079' }}>Loading...</span>
            ) : !rawData ? (
              <span style={{ color: '#4b6079' }}>No raw data available.</span>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {Object.entries(rawData)
                    .filter(([, v]) => v !== null && v !== '' && v !== undefined)
                    .map(([k, v]) => (
                      <tr key={k} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '3px 8px 3px 0', color: '#06b6d4', fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top', width: '140px' }}>
                          {RAW_FIELD_LABELS[k] || k}
                        </td>
                        <td style={{ padding: '3px 0', color: '#94a3b8', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                          {String(v)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        background: '#0d1f35',
        display: 'flex',
        gap: '8px',
      }}>
        <button
          onClick={() => addTargetMutation.mutate()}
          disabled={addTargetMutation.isPending}
          style={{
            flex: 1,
            background: '#2563eb', color: '#ffffff',
            border: 'none', borderRadius: '8px', padding: '8px 12px',
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

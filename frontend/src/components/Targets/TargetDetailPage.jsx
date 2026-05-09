import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchTarget, updateTarget, fetchTargetHistory, scrapeBlm } from '../../api/targets';
import { format, parseISO } from 'date-fns';
import WorkflowStepper from './WorkflowStepper';
import DueDiligenceChecklist from './DueDiligenceChecklist';
import FileUpload from './FileUpload';
import StatusBadge from '../Claims/StatusBadge';
import DisclaimerBanner from '../shared/DisclaimerBanner';
import { WORKFLOW_STATUSES } from '../../constants';
import useIsMobile from '../../hooks/useIsMobile';

const STAKING_CHECKLIST = [
  'Claim name assigned',
  'Location date set',
  'GPS coordinates recorded',
  'Proposed boundary sketch prepared',
  'County recording packet complete',
  'BLM Form 3830-1 prepared',
  '30-day county recording deadline tracked',
  '90-day BLM filing deadline tracked',
];

function Section({ title, children }) {
  return (
    <div style={{
      background: '#0f2039',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px',
      padding: '16px',
      marginBottom: '16px',
    }}>
      <h3 style={{
        margin: '0 0 12px',
        fontSize: '11px',
        fontWeight: 600,
        color: '#06b6d4',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ marginBottom: '8px', display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px' }}>
      <dt style={{ fontSize: '11px', color: '#4b6079', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</dt>
      <dd style={{ fontSize: '13px', color: '#ffffff', margin: 0 }}>{value}</dd>
    </div>
  );
}

export default function TargetDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [notes, setNotes] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const debounceRef = useRef(null);

  const { data: target, isLoading, error } = useQuery({
    queryKey: ['target', id],
    queryFn: () => fetchTarget(id),
  });

  const { data: history = [] } = useQuery({
    queryKey: ['targetHistory', id],
    queryFn: () => fetchTargetHistory(id),
  });

  const updateMutation = useMutation({
    mutationFn: (body) => updateTarget(id, body),
    onSuccess: (updated) => {
      qc.setQueryData(['target', id], updated);
      qc.invalidateQueries({ queryKey: ['targetHistory', id] });
    },
  });

  const isMobile = useIsMobile();

  useEffect(() => {
    if (target) setNotes(target.notes || '');
  }, [target?.id]);

  const handleNotesChange = (v) => {
    setNotes(v);
    setNoteSaved(false);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateMutation.mutate({ notes: v });
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    }, 1000);
  };

  if (isLoading) return <div style={{ padding: '40px', textAlign: 'center', color: '#4b6079' }}>Loading target...</div>;
  if (error) return <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>Error: {error.message}</div>;
  if (!target) return null;

  const isApproved = target.workflow_status === 'approved';
  const ws = WORKFLOW_STATUSES.find((s) => s.key === target.workflow_status);

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#0a1628' }}>
      <DisclaimerBanner />

      {/* Header */}
      <div style={{
        padding: isMobile ? '12px' : '16px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: '#0f2039',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '16px',
        flexWrap: 'wrap',
      }}>
        <button
          onClick={() => navigate('/targets')}
          style={{
            background: 'none',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '6px',
            padding: '5px 12px',
            cursor: 'pointer',
            fontSize: '13px',
            color: '#94a3b8',
            flexShrink: 0,
          }}
        >
          ← Back
        </button>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <input
            type="text"
            value={target.internal_name || ''}
            onChange={(e) => updateMutation.mutate({ internal_name: e.target.value })}
            style={{
              border: 'none', outline: 'none', fontSize: '18px', fontWeight: 700,
              color: '#ffffff', background: 'transparent', width: '100%', padding: '0',
            }}
          />
          <div style={{ marginTop: '8px', overflowX: 'auto' }}>
            <WorkflowStepper currentStatus={target.workflow_status} />
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <select
            value={target.workflow_status}
            onChange={(e) => updateMutation.mutate({ workflow_status: e.target.value })}
            style={{
              border: `1px solid ${ws?.color || 'rgba(255,255,255,0.12)'}`,
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '13px',
              color: ws?.color || '#94a3b8',
              fontWeight: 600,
              cursor: 'pointer',
              background: '#0d1f35',
            }}
          >
            {WORKFLOW_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {isApproved && (
        <div style={{
          margin: '16px 24px 0',
          background: 'rgba(249,115,22,0.1)',
          border: '1px solid rgba(249,115,22,0.3)',
          borderRadius: '8px',
          padding: '12px 16px',
          fontSize: '13px',
          color: '#fdba74',
        }}>
          ⚠️ <strong>APPROVED status is internal only.</strong> Physical staking, county recording,
          and BLM filing require completion of all verification steps. This system does not
          constitute legal advice.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) minmax(0,380px)', gap: '16px', padding: isMobile ? '12px' : '16px 24px' }}>
        {/* Left column */}
        <div>
          <Section title="Claim Summary">
            <Field label="Serial Number" value={target.serial_nr} />
            <Field label="Claim Name" value={target.claim_name} />
            <Field label="Claim Type" value={target.claim_type} />
            <Field label="Claimant" value={target.claimant_name} />
            <Field label="Location" value={[target.county, target.state].filter(Boolean).join(', ')} />
            <Field label="Acres" value={target.acres} />
            {target.case_status && (
              <div style={{ marginBottom: '8px', display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px' }}>
                <dt style={{ fontSize: '11px', color: '#4b6079', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Claim Status</dt>
                <dd style={{ margin: 0 }}>
                  <StatusBadge status={target.case_status} closedDt={target.closed_dt} />
                </dd>
              </div>
            )}
          </Section>

          <Section title="Due Diligence Checklist">
            <DueDiligenceChecklist targetId={Number(id)} />
          </Section>

          <Section title="Staking Packet Checklist (Prepare Manually)">
            <div style={{
              fontSize: '12px',
              color: '#fcd34d',
              marginBottom: '10px',
              background: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.2)',
              padding: '8px 10px',
              borderRadius: '6px',
            }}>
              This is a preparation guide only. ClaimTrakr does not file claims.
            </div>
            {STAKING_CHECKLIST.map((item) => (
              <label key={item} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '5px 0', fontSize: '13px', cursor: 'pointer', color: '#94a3b8',
              }}>
                <input type="checkbox" style={{ accentColor: '#2563eb', width: '15px', height: '15px' }} />
                {item}
              </label>
            ))}
          </Section>
        </div>

        {/* Right column */}
        <div>
          <Section title="Notes">
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Add research notes, observations..."
              rows={6}
              style={{
                width: '100%', padding: '8px 10px',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '6px', fontSize: '13px', resize: 'vertical',
                background: '#0a1628', color: '#ffffff',
              }}
            />
            {noteSaved && <div style={{ fontSize: '11px', color: '#22c55e', marginTop: '4px' }}>✓ Saved</div>}
          </Section>

          <Section title="Assignment & Priority">
            <div style={{ marginBottom: '10px' }}>
              <label style={{
                fontSize: '11px', color: '#06b6d4', display: 'block', marginBottom: '4px',
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                Assigned To
              </label>
              <input
                type="text"
                defaultValue={target.assigned_to || ''}
                onBlur={(e) => updateMutation.mutate({ assigned_to: e.target.value })}
                style={{
                  width: '100%', padding: '6px 8px',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '6px', fontSize: '13px',
                  background: '#0a1628', color: '#ffffff',
                }}
              />
            </div>
            <div>
              <label style={{
                fontSize: '11px', color: '#06b6d4', display: 'block', marginBottom: '4px',
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                Priority Score (0–100)
              </label>
              <input
                type="number"
                min={0} max={100}
                defaultValue={target.priority_score || 0}
                onBlur={(e) => updateMutation.mutate({ priority_score: parseInt(e.target.value) || 0 })}
                style={{
                  width: '100%', padding: '6px 8px',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '6px', fontSize: '13px',
                  background: '#0a1628', color: '#ffffff',
                }}
              />
            </div>
          </Section>

          <Section title="Status History">
            {history.length === 0 ? (
              <div style={{ fontSize: '13px', color: '#4b6079', fontStyle: 'italic' }}>No history yet.</div>
            ) : (
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {history.map((h) => (
                  <div key={h.id} style={{
                    padding: '6px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    fontSize: '12px',
                  }}>
                    <div style={{ fontWeight: 500, color: '#ffffff' }}>
                      {h.from_status ? `${h.from_status} → ${h.to_status}` : h.to_status}
                    </div>
                    <div style={{ color: '#4b6079' }}>
                      {h.changed_by || 'system'} · {h.changed_at ? format(parseISO(h.changed_at), 'MMM d, yyyy HH:mm') : ''}
                    </div>
                    {h.notes && <div style={{ color: '#94a3b8' }}>{h.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Files">
            <FileUpload targetId={Number(id)} />
          </Section>

          <BLMCaseSection targetId={id} target={target} onRefresh={() => qc.invalidateQueries({ queryKey: ['target', id] })} />
        </div>
      </div>
    </div>
  );
}

function BLMCaseSection({ targetId, target, onRefresh }) {
  const [scraping, setScraping] = useState(false);
  const [error, setError] = useState(null);

  const data = target?.blm_scraped_data;
  const scrapedAt = target?.blm_scraped_at;

  const handleScrape = async () => {
    setScraping(true);
    setError(null);
    try {
      await scrapeBlm(targetId);
      onRefresh();
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Scrape failed');
    } finally {
      setScraping(false);
    }
  };

  return (
    <Section title="BLM Case File">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <button
          onClick={handleScrape}
          disabled={scraping}
          style={{
            background: scraping ? '#334155' : '#2563eb',
            color: '#fff', border: 'none', borderRadius: '8px',
            padding: '7px 16px', fontSize: '13px', fontWeight: 600,
            cursor: scraping ? 'default' : 'pointer',
          }}
        >
          {scraping ? 'Fetching from MLRS…' : data ? '↻ Refresh BLM Data' : 'Fetch BLM Data'}
        </button>
        {scrapedAt && (
          <span style={{ fontSize: '11px', color: '#4b6079' }}>
            Last fetched {new Date(scrapedAt).toLocaleString()}
          </span>
        )}
      </div>

      {error && (
        <div style={{ fontSize: '13px', color: '#ef4444', marginBottom: '8px' }}>{error}</div>
      )}

      {data?.error && (
        <div style={{ fontSize: '13px', color: '#ef4444' }}>Scrape error: {data.error}</div>
      )}

      {data && !data.error && (
        <div>
          {data.sections?.fields && Object.keys(data.sections.fields).length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#06b6d4', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Case Details</div>
              <dl style={{ margin: 0 }}>
                {Object.entries(data.sections.fields).map(([k, v]) => (
                  <div key={k} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '8px', marginBottom: '6px' }}>
                    <dt style={{ fontSize: '11px', color: '#4b6079', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</dt>
                    <dd style={{ fontSize: '13px', color: '#ffffff', margin: 0 }}>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {data.sections?.tables?.map((tbl, ti) => (
            tbl.rows.length > 0 && (
              <div key={ti} style={{ marginBottom: '16px', overflowX: 'auto' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#06b6d4', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  Table {ti + 1}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  {tbl.headers.length > 0 && (
                    <thead>
                      <tr>
                        {tbl.headers.map((h, i) => (
                          <th key={i} style={{ padding: '4px 8px', textAlign: 'left', color: '#06b6d4', fontWeight: 600, fontSize: '11px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {tbl.rows.slice(0, 20).map((row, ri) => (
                      <tr key={ri} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {row.map((cell, ci) => (
                          <td key={ci} style={{ padding: '4px 8px', color: '#94a3b8' }}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ))}

          {!data.sections?.fields && !data.sections?.tables?.length && data.raw_text && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#06b6d4', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Raw Page Text</div>
              <pre style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '300px', overflowY: 'auto' }}>
                {data.raw_text}
              </pre>
            </div>
          )}
        </div>
      )}

      {!data && !scraping && (
        <div style={{ fontSize: '13px', color: '#4b6079', fontStyle: 'italic' }}>
          Click "Fetch BLM Data" to pull live case info from the MLRS portal.
        </div>
      )}
    </Section>
  );
}

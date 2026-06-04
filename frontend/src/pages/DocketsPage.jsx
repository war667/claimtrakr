import React, { useState, useRef, useCallback, useEffect } from 'react';
import { listDockets, fetchDocket, deleteDocket, streamAskDocket } from '../api/dockets';

// ---------------------------------------------------------------------------
// Static dataset for browsing (client-side) — mirrors backend ALL_RECORDS
// This avoids an extra API call for the full catalog; processed status is
// merged from the DB query.
// ---------------------------------------------------------------------------

const STATUS_COLORS = {
  ready:       { bg: 'rgba(34,197,94,0.15)',  border: 'rgba(34,197,94,0.3)',  text: '#86efac' },
  processing:  { bg: 'rgba(234,179,8,0.15)',  border: 'rgba(234,179,8,0.3)',  text: '#fde047' },
  downloading: { bg: 'rgba(234,179,8,0.15)',  border: 'rgba(234,179,8,0.3)',  text: '#fde047' },
  error:       { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)',  text: '#fca5a5' },
  pending:     { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)', text: '#4b6079' },
};

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.pending;
  return (
    <span style={{
      fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '999px',
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>
      {status ?? 'not fetched'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Ask panel (streaming Q&A)
// ---------------------------------------------------------------------------

function AskPanel({ docket, onClose }) {
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, streaming]);

  const send = useCallback(async (text) => {
    const q = (text ?? input).trim();
    if (!q || streaming) return;
    setInput('');
    setError('');

    const msgs = [...history, { role: 'user', content: q }];
    setHistory(msgs);
    setStreaming(true);

    const answerIdx = msgs.length;
    setHistory((h) => [...h, { role: 'assistant', content: '' }]);

    const controller = new AbortController();
    abortRef.current = controller;

    await streamAskDocket({
      docketNr: docket.docket_nr,
      question: q,
      history: history,
      signal: controller.signal,
      onChunk: (chunk) => {
        setHistory((h) => {
          const next = [...h];
          next[answerIdx] = { ...next[answerIdx], content: next[answerIdx].content + chunk };
          return next;
        });
      },
      onDone: () => { setStreaming(false); abortRef.current = null; },
      onError: (msg) => {
        setError(msg);
        setStreaming(false);
        setHistory((h) => h.slice(0, answerIdx));
        abortRef.current = null;
      },
    });
  }, [input, history, streaming, docket.docket_nr]);

  const STARTERS = [
    'Is this likely BLM land still open for staking?',
    'What minerals were found and what were the assay results?',
    'What exploration methods were used?',
    'Was the project funded, denied, or abandoned?',
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '24px',
    }}>
      <style>{`@keyframes blink2 { 50% { opacity: 0; } }`}</style>
      <div style={{
        background: '#0a1628', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '12px', width: '100%', maxWidth: '760px', maxHeight: '88vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>
              Q&A — Docket {docket.docket_nr}
            </div>
            <div style={{ fontSize: '11px', color: '#4b6079', marginTop: '2px' }}>
              {docket.property_name} · {docket.county}, {docket.state} · {docket.commodity}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#4b6079',
            cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: '2px 6px',
          }}>✕</button>
        </div>

        {/* Summary strip */}
        {docket.summary && (
          <div style={{
            padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
            background: '#0f2039', flexShrink: 0,
          }}>
            <div style={{ fontSize: '11px', color: '#4b6079', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Docket Summary</div>
            <div style={{
              fontSize: '12px', color: '#94a3b8', lineHeight: '1.55',
              maxHeight: '100px', overflowY: 'auto', whiteSpace: 'pre-wrap',
            }}>{docket.summary}</div>
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {history.length === 0 ? (
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '12px', color: '#4b6079', marginBottom: '10px' }}>Suggested questions:</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {STARTERS.map((s) => (
                  <button key={s} onClick={() => send(s)} style={{
                    background: '#0f2039', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px', padding: '8px 12px', textAlign: 'left',
                    color: '#94a3b8', fontSize: '12px', cursor: 'pointer', lineHeight: '1.4',
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(37,99,235,0.4)'; e.currentTarget.style.color = '#e2e8f0'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#94a3b8'; }}
                  >{s}</button>
                ))}
              </div>
            </div>
          ) : (
            history.map((m, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                marginBottom: '12px',
              }}>
                <div style={{
                  background: m.role === 'user' ? '#2563eb' : '#0f2039',
                  border: m.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '2px 12px 12px 12px',
                  padding: '10px 14px', maxWidth: '85%',
                  fontSize: '13px', color: m.role === 'user' ? '#fff' : '#e2e8f0',
                  lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  fontFamily: m.role === 'assistant' ? 'monospace' : 'inherit',
                }}>
                  {m.content || (streaming && i === history.length - 1 ? (
                    <span style={{ display: 'inline-block', width: '8px', height: '13px', background: '#2563eb', verticalAlign: 'text-bottom', animation: 'blink2 0.8s step-start infinite' }} />
                  ) : '…')}
                  {m.role === 'assistant' && streaming && i === history.length - 1 && m.content && (
                    <span style={{ display: 'inline-block', width: '8px', height: '13px', background: '#2563eb', marginLeft: '2px', verticalAlign: 'text-bottom', animation: 'blink2 0.8s step-start infinite' }} />
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Error */}
        {error && (
          <div style={{ margin: '0 20px 8px', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', color: '#fca5a5', fontSize: '12px', display: 'flex', justifyContent: 'space-between' }}>
            <span>{error}</span>
            <span onClick={() => setError('')} style={{ cursor: 'pointer', color: '#4b6079', marginLeft: '10px' }}>✕</span>
          </div>
        )}

        {/* Input */}
        <div style={{ padding: '12px 20px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div style={{
            display: 'flex', gap: '8px', alignItems: 'flex-end',
            background: '#0f2039', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '10px', padding: '8px 12px',
          }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask about this docket…"
              rows={1}
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                color: '#f1f5f9', fontSize: '13px', resize: 'none',
                fontFamily: 'inherit', lineHeight: '1.5', maxHeight: '100px', overflowY: 'auto',
              }}
              onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'; }}
              disabled={streaming}
            />
            {streaming ? (
              <button onClick={() => { abortRef.current?.abort(); setStreaming(false); }} style={{
                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
                borderRadius: '6px', padding: '6px 12px', color: '#fca5a5', cursor: 'pointer', fontSize: '12px', flexShrink: 0,
              }}>◼ Stop</button>
            ) : (
              <button onClick={() => send()} disabled={!input.trim()} style={{
                background: input.trim() ? '#2563eb' : '#1e3a5f', border: 'none',
                borderRadius: '6px', padding: '6px 14px', color: input.trim() ? '#fff' : '#4b6079',
                cursor: input.trim() ? 'pointer' : 'default', fontSize: '13px', fontWeight: 600, flexShrink: 0,
              }}>Send ↵</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary modal
// ---------------------------------------------------------------------------

function SummaryModal({ docket, onClose, onAsk }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '24px',
    }}>
      <div style={{
        background: '#0a1628', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '12px', width: '100%', maxWidth: '700px', maxHeight: '85vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>
              Docket {docket.docket_nr} — {docket.property_name}
            </div>
            <div style={{ fontSize: '11px', color: '#4b6079', marginTop: '2px' }}>
              {docket.agency} · {docket.county}, {docket.state} · {docket.commodity} · {docket.land_hint}
              {docket.file_size_bytes ? ` · ${(docket.file_size_bytes / 1024 / 1024).toFixed(1)} MB` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#4b6079', cursor: 'pointer', fontSize: '18px', padding: '2px 6px' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          <div style={{
            fontSize: '13px', color: '#e2e8f0', lineHeight: '1.7',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace',
          }}>
            {docket.summary || 'No summary available.'}
          </div>
        </div>
        <div style={{
          padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', gap: '8px', justifyContent: 'flex-end', flexShrink: 0,
        }}>
          <button onClick={onClose} style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px', padding: '7px 16px', color: '#94a3b8',
            cursor: 'pointer', fontSize: '13px',
          }}>Close</button>
          <button onClick={onAsk} style={{
            background: '#2563eb', border: 'none', borderRadius: '6px',
            padding: '7px 16px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
          }}>Ask Questions →</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Docket row
// ---------------------------------------------------------------------------

function DocketRow({ doc, onFetch, onShowSummary, onAsk, onDelete, fetching }) {
  const isReady = doc.db_status === 'ready';
  const isBusy = fetching === doc.docket || doc.db_status === 'downloading' || doc.db_status === 'processing';

  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      <td style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
        {doc.docket}
      </td>
      <td style={{ padding: '10px 12px', color: '#e2e8f0', fontSize: '12px' }}>{doc.county}</td>
      <td style={{ padding: '10px 12px', color: '#e2e8f0', fontSize: '12px', maxWidth: '200px' }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.property}</div>
      </td>
      <td style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '12px' }}>{doc.commodity}</td>
      <td style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '11px', whiteSpace: 'nowrap' }}>{doc.agency}</td>
      <td style={{ padding: '10px 12px' }}>
        <span style={{
          fontSize: '10px', padding: '2px 7px', borderRadius: '999px', fontWeight: 600,
          background: doc.land_hint === 'BLM' ? 'rgba(34,197,94,0.1)' : doc.land_hint === 'State' ? 'rgba(234,179,8,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${doc.land_hint === 'BLM' ? 'rgba(34,197,94,0.25)' : doc.land_hint === 'State' ? 'rgba(234,179,8,0.25)' : 'rgba(239,68,68,0.25)'}`,
          color: doc.land_hint === 'BLM' ? '#86efac' : doc.land_hint === 'State' ? '#fde047' : '#fca5a5',
        }}>{doc.land_hint}</span>
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#4b6079', fontSize: '11px', whiteSpace: 'nowrap' }}>
        {doc.size_mb > 0 ? `${doc.size_mb} MB` : '—'}
      </td>
      <td style={{ padding: '10px 12px' }}>
        <StatusBadge status={doc.db_status} />
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
        {isReady ? (
          <span style={{ display: 'inline-flex', gap: '6px' }}>
            <button onClick={() => onShowSummary(doc)} style={{
              background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.3)',
              borderRadius: '5px', padding: '4px 10px', color: '#93c5fd',
              cursor: 'pointer', fontSize: '11px', fontWeight: 600,
            }}>Summary</button>
            <button onClick={() => onAsk(doc)} style={{
              background: '#2563eb', border: 'none',
              borderRadius: '5px', padding: '4px 10px', color: '#fff',
              cursor: 'pointer', fontSize: '11px', fontWeight: 600,
            }}>Ask ⛏</button>
            <button onClick={() => onDelete(doc)} style={{
              background: 'none', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: '5px', padding: '4px 8px', color: 'rgba(239,68,68,0.6)',
              cursor: 'pointer', fontSize: '11px',
            }} title="Remove docket">✕</button>
          </span>
        ) : (
          <span style={{ display: 'inline-flex', gap: '6px' }}>
            <button
              onClick={() => onFetch(doc)}
              disabled={isBusy}
              style={{
                background: isBusy ? 'rgba(255,255,255,0.04)' : 'rgba(34,197,94,0.1)',
                border: `1px solid ${isBusy ? 'rgba(255,255,255,0.08)' : 'rgba(34,197,94,0.3)'}`,
                borderRadius: '5px', padding: '4px 10px',
                color: isBusy ? '#4b6079' : '#86efac',
                cursor: isBusy ? 'default' : 'pointer', fontSize: '11px', fontWeight: 600,
              }}
            >
              {isBusy ? 'Processing…' : 'Fetch PDF'}
            </button>
            {!isBusy && (
              <button onClick={() => onDelete(doc)} style={{
                background: 'none', border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: '5px', padding: '4px 8px', color: 'rgba(239,68,68,0.6)',
                cursor: 'pointer', fontSize: '11px',
              }} title="Remove docket">✕</button>
            )}
          </span>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

// Minimal static catalog loaded from backend (we call the DB for status)
// Format: { docket, state, county, agency, property, commodity, size_mb, land_hint }
// We merge DB records on top.

export default function DocketsPage() {
  const [dbRecords, setDbRecords] = useState({});   // keyed by docket_nr
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState('');

  const [filterState, setFilterState] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLand, setFilterLand] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [fetching, setFetching] = useState(null);   // docket_nr currently being processed
  const [fetchError, setFetchError] = useState('');
  const [summaryDoc, setSummaryDoc] = useState(null);
  const [askDoc, setAskDoc] = useState(null);

  const PAGE_SIZE = 50;

  // Load DB state
  async function loadDbRecords() {
    try {
      const rows = await listDockets();
      const map = {};
      for (const r of rows) map[r.docket_nr] = r;
      setDbRecords(map);
    } catch (e) {
      setFetchErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDbRecords(); }, []);

  // Merge static + DB into display rows
  // We rely on the backend's ALL_RECORDS data exposed as the DB list,
  // but we also want to show unprocessed dockets from the static catalog.
  // Since we embedded the catalog in the backend, we fetch from /dockets?status=ready
  // for processed ones, but the full catalog isn't exposed via API.
  // Instead we use the AI assistant context. For now, show all DB records +
  // a placeholder message for unprocessed ones that must be fetched by docket nr.

  // Build display list from dbRecords (already fetched) and show a search-by-docket input
  const allDbRows = Object.values(dbRecords);

  const filtered = allDbRows.filter((r) => {
    if (filterState && r.state !== filterState) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    if (filterLand && r.land_hint !== filterLand) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!r.docket_nr?.toLowerCase().includes(s) &&
          !r.property_name?.toLowerCase().includes(s) &&
          !r.county?.toLowerCase().includes(s) &&
          !r.commodity?.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleFetch(docNr) {
    setFetching(docNr);
    setFetchError('');
    try {
      const result = await fetchDocket(docNr);
      setDbRecords((prev) => ({ ...prev, [result.docket_nr]: result }));
    } catch (e) {
      setFetchError(e.message);
    } finally {
      setFetching(null);
    }
  }

  async function handleDelete(doc) {
    if (!window.confirm(`Remove docket ${doc.docket} (${doc.property}) from the library?`)) return;
    try {
      await deleteDocket(doc.docket);
      setDbRecords((prev) => {
        const next = { ...prev };
        delete next[doc.docket];
        return next;
      });
    } catch (e) {
      setFetchError(e.message);
    }
  }

  // For direct docket-nr fetch (unprocessed dockets not yet in DB)
  const [directNr, setDirectNr] = useState('');
  async function handleDirectFetch() {
    const nr = directNr.trim();
    if (!nr) return;
    setDirectNr('');
    await handleFetch(nr);
    await loadDbRecords();
  }

  const states = [...new Set(allDbRows.map((r) => r.state).filter(Boolean))].sort();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>
          Docket Library
        </div>
        <div style={{ fontSize: '11px', color: '#4b6079', marginTop: '2px' }}>
          USGS DS-1004 · Utah & Nevada · 1950–1974
        </div>
      </div>

      {/* Fetch a new docket */}
      <div style={{
        padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(234,179,8,0.04)',
        borderLeft: '3px solid rgba(234,179,8,0.6)',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#4b6079', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>
          Fetch a docket
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            value={directNr}
            onChange={(e) => setDirectNr(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleDirectFetch()}
            placeholder="Enter docket number (e.g. 2710, 0262, 4815)"
            style={{
              background: '#0f2039', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '6px', padding: '8px 14px', color: '#f1f5f9',
              fontSize: '13px', outline: 'none', width: '320px',
            }}
          />
          <button onClick={handleDirectFetch} disabled={!directNr.trim() || !!fetching} style={{
            background: directNr.trim() && !fetching ? '#22c55e' : 'rgba(255,255,255,0.06)',
            border: 'none',
            borderRadius: '6px', padding: '8px 18px',
            color: directNr.trim() && !fetching ? '#fff' : '#4b6079',
            cursor: directNr.trim() && !fetching ? 'pointer' : 'default',
            fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap',
          }}>
            {fetching ? 'Processing…' : 'Fetch & Analyze PDF →'}
          </button>
          {fetchError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', color: '#fca5a5', fontSize: '12px' }}>
              <span>{fetchError}</span>
              <span onClick={() => setFetchError('')} style={{ cursor: 'pointer', color: '#4b6079', fontSize: '14px' }}>✕</span>
            </div>
          )}
        </div>
        <div style={{ fontSize: '11px', color: '#2d3f55', marginTop: '6px' }}>
          Downloads the PDF from USGS, analyzes it with Claude, then lets you ask questions about it.
        </div>
      </div>

      {/* Filters */}
      <div style={{
        padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.04)',
        display: 'flex', gap: '10px', flexShrink: 0, flexWrap: 'wrap',
      }}>
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search dockets, properties, counties…"
          style={{
            background: '#0f2039', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px', padding: '6px 12px', color: '#f1f5f9',
            fontSize: '12px', outline: 'none', width: '260px',
          }}
        />
        <select value={filterState} onChange={(e) => { setFilterState(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">All states</option>
          {states.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">All statuses</option>
          <option value="ready">Ready</option>
          <option value="processing">Processing</option>
          <option value="error">Error</option>
        </select>
        <select value={filterLand} onChange={(e) => { setFilterLand(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">All land types</option>
          <option value="BLM">BLM</option>
          <option value="State">State</option>
          <option value="Private">Private</option>
        </select>
        <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#4b6079', alignSelf: 'center' }}>
          {filtered.length} docket{filtered.length !== 1 ? 's' : ''} in library
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#4b6079', fontSize: '13px' }}>
            Loading docket library…
          </div>
        ) : fetchErr ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#fca5a5', fontSize: '13px' }}>
            {fetchErr}
          </div>
        ) : allDbRows.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📄</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
              No dockets fetched yet
            </div>
            <div style={{ fontSize: '13px', color: '#4b6079', maxWidth: '400px', margin: '0 auto' }}>
              Enter a docket number above (e.g. <code style={{ color: '#93c5fd' }}>2710</code>) to download
              and analyze it with Claude. Dockets come from the USGS Data Series 1004.
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['Docket', 'County', 'Property', 'Commodity', 'Agency', 'Land', 'Size', 'Status', ''].map((h) => (
                  <th key={h} style={{
                    padding: '8px 12px', textAlign: h === 'Size' || h === '' ? 'right' : 'left',
                    fontSize: '10px', fontWeight: 600, color: '#4b6079',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    background: '#0a1628', position: 'sticky', top: 0, zIndex: 1,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => {
                const displayDoc = {
                  docket: r.docket_nr,
                  state: r.state,
                  county: r.county,
                  agency: r.agency,
                  property: r.property_name,
                  commodity: r.commodity,
                  size_mb: r.file_size_bytes ? (r.file_size_bytes / 1024 / 1024).toFixed(1) : 0,
                  land_hint: r.land_hint ?? 'BLM',
                  db_status: r.status,
                  ...r,
                };
                return (
                  <DocketRow
                    key={r.docket_nr}
                    doc={displayDoc}
                    fetching={fetching}
                    onFetch={(d) => handleFetch(d.docket)}
                    onShowSummary={(d) => setSummaryDoc(r)}
                    onAsk={(d) => setAskDoc(r)}
                    onDelete={(d) => handleDelete(d)}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div style={{
          padding: '10px 24px', borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={pageBtn(page !== 1)}>← Prev</button>
          <span style={{ fontSize: '12px', color: '#4b6079' }}>Page {page} / {pageCount}</span>
          <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount} style={pageBtn(page !== pageCount)}>Next →</button>
        </div>
      )}

      {/* Modals */}
      {summaryDoc && (
        <SummaryModal
          docket={summaryDoc}
          onClose={() => setSummaryDoc(null)}
          onAsk={() => { setAskDoc(summaryDoc); setSummaryDoc(null); }}
        />
      )}
      {askDoc && (
        <AskPanel docket={askDoc} onClose={() => setAskDoc(null)} />
      )}
    </div>
  );
}

const selectStyle = {
  background: '#0f2039', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '6px', padding: '6px 10px', color: '#94a3b8',
  fontSize: '12px', outline: 'none', cursor: 'pointer',
};

function pageBtn(active) {
  return {
    background: active ? 'rgba(37,99,235,0.15)' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${active ? 'rgba(37,99,235,0.3)' : 'rgba(255,255,255,0.08)'}`,
    borderRadius: '6px', padding: '5px 12px',
    color: active ? '#93c5fd' : '#4b6079',
    cursor: active ? 'pointer' : 'default', fontSize: '12px',
  };
}

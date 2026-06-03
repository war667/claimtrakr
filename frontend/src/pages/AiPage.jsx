import React, { useState, useRef, useEffect, useCallback } from 'react';
import { streamChat } from '../api/ai';

const STARTER_PROMPTS = [
  'Analyze all Utah counties and show me dashboard cards sorted by data volume.',
  'Show me the top staking opportunities in Nevada for critical minerals.',
  'Give me a full breakdown of San Juan County, Utah.',
  'Which counties have the highest concentration of uranium dockets?',
  'Analyze Elko County, Nevada for open staking candidates.',
  'Show me all dockets with cobalt or tungsten across both states.',
];

function UserBubble({ content }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
      <div style={{
        background: '#2563eb', borderRadius: '12px 12px 2px 12px',
        padding: '10px 14px', maxWidth: '70%', fontSize: '14px', color: '#ffffff',
        lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {content}
      </div>
    </div>
  );
}

function AiBubble({ content, streaming }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '16px' }}>
      <div style={{ display: 'flex', gap: '10px', maxWidth: '90%' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
          background: '#0f2039', border: '1px solid rgba(37,99,235,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '14px', marginTop: '2px',
        }}>⛏</div>
        <div style={{
          background: '#0f2039', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '2px 12px 12px 12px', padding: '12px 16px',
          fontSize: '13px', color: '#e2e8f0', lineHeight: '1.65',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace',
          flex: 1,
        }}>
          {content || (streaming ? '' : '…')}
          {streaming && (
            <span style={{
              display: 'inline-block', width: '8px', height: '14px',
              background: '#2563eb', marginLeft: '2px', verticalAlign: 'text-bottom',
              animation: 'blink 0.8s step-start infinite',
            }} />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onPrompt }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '32px',
    }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>⛏</div>
      <div style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
        ClaimTrakr AI Research
      </div>
      <div style={{ fontSize: '13px', color: '#4b6079', marginBottom: '32px', textAlign: 'center', maxWidth: '480px' }}>
        Pre-loaded with USGS Data Series 1004 — 1,486 mineral exploration dockets from Utah & Nevada (1950–1974).
        Ask about any county, commodity, or staking opportunity.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%', maxWidth: '640px' }}>
        {STARTER_PROMPTS.map((p) => (
          <button key={p} onClick={() => onPrompt(p)} style={{
            background: '#0f2039', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px', padding: '10px 14px', textAlign: 'left',
            color: '#94a3b8', fontSize: '12px', cursor: 'pointer', lineHeight: '1.4',
            transition: 'border-color 0.15s, color 0.15s',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(37,99,235,0.4)'; e.currentTarget.style.color = '#e2e8f0'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#94a3b8'; }}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AiPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const send = useCallback(async (text) => {
    const userText = (text ?? input).trim();
    if (!userText || streaming) return;

    setInput('');
    setError('');

    const userMsg = { role: 'user', content: userText };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setStreaming(true);

    const assistantIndex = nextMessages.length;
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    const controller = new AbortController();
    abortRef.current = controller;

    await streamChat({
      messages: nextMessages,
      signal: controller.signal,
      onChunk: (chunk) => {
        setMessages((prev) => {
          const updated = [...prev];
          updated[assistantIndex] = {
            ...updated[assistantIndex],
            content: updated[assistantIndex].content + chunk,
          };
          return updated;
        });
      },
      onDone: () => {
        setStreaming(false);
        abortRef.current = null;
      },
      onError: (msg) => {
        setError(msg);
        setStreaming(false);
        setMessages((prev) => prev.slice(0, assistantIndex));
        abortRef.current = null;
      },
    });
  }, [input, messages, streaming]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function handleStop() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  function handleClear() {
    abortRef.current?.abort();
    setMessages([]);
    setStreaming(false);
    setError('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: '1100px', width: '100%' }}>
      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
      `}</style>

      {/* Header */}
      <div style={{
        padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>
            ⛏ AI Research Assistant
          </div>
          <div style={{ fontSize: '11px', color: '#4b6079', marginTop: '2px' }}>
            USGS DS-1004 · Utah & Nevada · 1950–1974 · 1,486 dockets pre-loaded
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={handleClear} style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px', padding: '5px 12px', color: '#4b6079',
            cursor: 'pointer', fontSize: '12px',
          }}>
            Clear chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {messages.length === 0 ? (
          <EmptyState onPrompt={(p) => send(p)} />
        ) : (
          <>
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <UserBubble key={i} content={m.content} />
              ) : (
                <AiBubble key={i} content={m.content} streaming={streaming && i === messages.length - 1} />
              )
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div style={{
          margin: '0 24px 8px', padding: '10px 14px',
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '8px', color: '#fca5a5', fontSize: '13px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{error}</span>
          <span onClick={() => setError('')} style={{ cursor: 'pointer', color: '#4b6079', marginLeft: '12px' }}>✕</span>
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: '12px 24px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', gap: '10px', alignItems: 'flex-end',
          background: '#0f2039', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px', padding: '10px 14px',
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about any county, commodity, or staking opportunity…"
            rows={1}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: '#f1f5f9', fontSize: '14px', resize: 'none',
              fontFamily: 'inherit', lineHeight: '1.5', maxHeight: '160px',
              overflowY: 'auto',
            }}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
            }}
            disabled={streaming}
          />
          {streaming ? (
            <button onClick={handleStop} style={{
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: '8px', padding: '8px 14px', color: '#fca5a5',
              cursor: 'pointer', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              ◼ Stop
            </button>
          ) : (
            <button onClick={() => send()} disabled={!input.trim()} style={{
              background: input.trim() ? '#2563eb' : '#1e3a5f',
              border: 'none', borderRadius: '8px', padding: '8px 16px',
              color: input.trim() ? '#fff' : '#4b6079',
              cursor: input.trim() ? 'pointer' : 'default',
              fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              Send ↵
            </button>
          )}
        </div>
        <div style={{ fontSize: '11px', color: '#2d3f55', marginTop: '6px', textAlign: 'center' }}>
          Enter to send · Shift+Enter for new line · Data is historical (1950–1974) — always verify with BLM LR2000
        </div>
      </div>
    </div>
  );
}

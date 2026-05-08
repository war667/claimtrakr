import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchChecklist, updateChecklistItem } from '../../api/targets';

function ChecklistItem({ item, targetId }) {
  const qc = useQueryClient();
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(item.notes || '');

  const mutation = useMutation({
    mutationFn: (body) => updateChecklistItem(targetId, item.id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checklist', targetId] }),
  });

  const toggle = () => {
    mutation.mutate({ is_complete: !item.is_complete, notes: item.notes });
  };

  const saveNotes = () => {
    mutation.mutate({ is_complete: item.is_complete, notes });
  };

  return (
    <div style={{
      padding: '8px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      opacity: item.is_complete ? 0.65 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="checkbox"
          checked={item.is_complete}
          onChange={toggle}
          style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#22c55e' }}
        />
        <span style={{
          flex: 1,
          fontSize: '13px',
          color: item.is_complete ? '#4b6079' : '#ffffff',
          textDecoration: item.is_complete ? 'line-through' : 'none',
        }}>
          {item.task_label}
        </span>
        <button
          onClick={() => setNotesOpen((v) => !v)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#4b6079', fontSize: '12px', padding: '0 4px',
          }}
          title="Add notes"
        >
          {notesOpen ? '▲' : '▼'}
        </button>
        {item.is_complete && (
          <span style={{ fontSize: '11px', color: '#22c55e' }}>✓ Done</span>
        )}
      </div>
      {notesOpen && (
        <div style={{ paddingLeft: '24px', marginTop: '6px', display: 'flex', gap: '6px' }}>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes..."
            rows={2}
            style={{
              flex: 1, fontSize: '12px', padding: '4px 8px',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '6px', resize: 'vertical',
              background: '#0a1628', color: '#ffffff',
            }}
          />
          <button
            onClick={saveNotes}
            disabled={mutation.isPending}
            style={{
              background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px',
              padding: '4px 10px', fontSize: '12px', cursor: 'pointer', alignSelf: 'flex-start',
            }}
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}

export default function DueDiligenceChecklist({ targetId }) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['checklist', targetId],
    queryFn: () => fetchChecklist(targetId),
  });

  if (isLoading) return <div style={{ color: '#4b6079', fontSize: '13px' }}>Loading checklist...</div>;

  const complete = items.filter((i) => i.is_complete).length;
  const total = items.length;
  const pct = total > 0 ? Math.round((complete / total) * 100) : 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '13px', color: '#94a3b8' }}>
          {complete} of {total} complete
        </span>
        <span style={{ fontSize: '13px', fontWeight: 600, color: pct === 100 ? '#22c55e' : '#94a3b8' }}>
          {pct}%
        </span>
      </div>
      <div style={{
        height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px',
        marginBottom: '12px', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: pct === 100 ? '#22c55e' : '#2563eb',
          transition: 'width 0.3s', borderRadius: '3px',
        }} />
      </div>
      {items.map((item) => (
        <ChecklistItem key={item.id} item={item} targetId={targetId} />
      ))}
    </div>
  );
}

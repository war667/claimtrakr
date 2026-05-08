import React from 'react';
import { WORKFLOW_STATUSES } from '../../constants';

export default function WorkflowStepper({ currentStatus }) {
  const currentIdx = WORKFLOW_STATUSES.findIndex((s) => s.key === currentStatus);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0',
      overflowX: 'auto',
      padding: '4px 0',
      background: '#0a1628',
    }}>
      {WORKFLOW_STATUSES.map((s, i) => {
        const isDone = i < currentIdx;
        const isCurrent = i === currentIdx;
        const isFuture = i > currentIdx;

        return (
          <React.Fragment key={s.key}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              minWidth: '64px',
            }}>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: isCurrent ? s.color : isDone ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                color: isCurrent ? '#fff' : isDone ? '#94a3b8' : '#334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 700,
                border: isCurrent ? `2px solid ${s.color}` : '2px solid transparent',
                flexShrink: 0,
                boxShadow: isCurrent ? `0 0 12px ${s.color}66` : 'none',
              }}>
                {isDone ? '✓' : i + 1}
              </div>
              <div style={{
                fontSize: '10px',
                color: isCurrent ? s.color : isDone ? '#94a3b8' : '#334155',
                fontWeight: isCurrent ? 700 : 400,
                textAlign: 'center',
                lineHeight: 1.2,
                width: '60px',
              }}>
                {s.label}
              </div>
            </div>
            {i < WORKFLOW_STATUSES.length - 1 && (
              <div style={{
                height: '2px',
                flex: '1',
                minWidth: '12px',
                background: isDone ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)',
                marginBottom: '20px',
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

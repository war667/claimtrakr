import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchClaimEvents } from '../../api/claims';
import { format, parseISO } from 'date-fns';

const EVENT_ICONS = {
  new_claim:           '🆕',
  status_changed:      '🔄',
  claimant_changed:    '👤',
  disposition_changed: '📋',
  claim_removed:       '❌',
  geometry_changed:    '📍',
  acres_changed:       '📐',
};

export default function ClaimEventLog({ serialNr, maxItems = 5 }) {
  const { data: events, isLoading } = useQuery({
    queryKey: ['claimEvents', serialNr],
    queryFn: () => fetchClaimEvents(serialNr),
    enabled: !!serialNr,
  });

  if (isLoading) return <div style={{ color: '#9ca3af', fontSize: '13px' }}>Loading events...</div>;
  if (!events?.length) return (
    <div style={{ color: '#9ca3af', fontSize: '13px', fontStyle: 'italic' }}>
      No events recorded yet.
    </div>
  );

  const displayed = events.slice(0, maxItems);

  return (
    <div>
      {displayed.map((evt) => (
        <div key={evt.id} style={{
          display: 'flex',
          gap: '8px',
          padding: '6px 0',
          borderBottom: '1px solid #f3f4f6',
          fontSize: '13px',
        }}>
          <span style={{ flexShrink: 0, fontSize: '16px' }}>
            {EVENT_ICONS[evt.event_type] || '📌'}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, color: '#374151' }}>
              {evt.event_type.replace(/_/g, ' ')}
              {evt.event_subtype && (
                <span style={{ color: '#6b7280', marginLeft: '6px', fontWeight: 400 }}>
                  ({evt.event_subtype.replace(/_/g, ' ')})
                </span>
              )}
            </div>
            {evt.old_value && evt.new_value && (
              <div style={{ color: '#6b7280', fontSize: '12px' }}>
                {evt.old_value} → {evt.new_value}
              </div>
            )}
          </div>
          <div style={{ color: '#9ca3af', fontSize: '11px', flexShrink: 0 }}>
            {evt.detected_at
              ? format(parseISO(evt.detected_at), 'MMM d, yyyy')
              : '—'}
          </div>
        </div>
      ))}
    </div>
  );
}

import React from 'react';
import { CLAIM_STATUS_COLORS } from '../../constants';
import { differenceInDays, parseISO } from 'date-fns';

function getStatusColor(status, closedDt) {
  if (status === 'ACTIVE') return CLAIM_STATUS_COLORS.ACTIVE;
  if (status === 'CLOSED' && closedDt) {
    const days = differenceInDays(new Date(), parseISO(String(closedDt).split('T')[0]));
    if (days <= 7)  return CLAIM_STATUS_COLORS.CLOSED_RECENT_7;
    if (days <= 30) return CLAIM_STATUS_COLORS.CLOSED_RECENT_30;
    if (days <= 90) return CLAIM_STATUS_COLORS.CLOSED_RECENT_90;
  }
  return CLAIM_STATUS_COLORS.CLOSED;
}

export default function StatusBadge({ status, closedDt, size = 'sm' }) {
  const color = getStatusColor(status, closedDt);
  const padding = size === 'sm' ? '2px 8px' : '4px 12px';
  const fontSize = size === 'sm' ? '11px' : '13px';

  return (
    <span style={{
      display: 'inline-block',
      background: color + '22',
      color: color,
      border: `1px solid ${color}44`,
      borderRadius: '9999px',
      padding,
      fontSize,
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
}

export const WORKFLOW_STATUSES = [
  { key: 'new',               label: 'New',               color: '#6b7280' },
  { key: 'researching',       label: 'Researching',       color: '#3b82f6' },
  { key: 'needs_field_check', label: 'Needs Field Check', color: '#f59e0b' },
  { key: 'field_checked',     label: 'Field Checked',     color: '#8b5cf6' },
  { key: 'legal_review',      label: 'Legal Review',      color: '#06b6d4' },
  { key: 'approved',          label: 'Approved to Stake', color: '#10b981' },
  { key: 'rejected',          label: 'Rejected',          color: '#ef4444' },
  { key: 'staked',            label: 'Staked',            color: '#059669' },
  { key: 'county_filed',      label: 'County Filed',      color: '#0d9488' },
  { key: 'blm_filed',         label: 'BLM Filed',         color: '#0369a1' },
];

export const CLAIM_STATUS_COLORS = {
  ACTIVE: '#22c55e',
  CLOSED: '#9ca3af',
  CLOSED_RECENT_7:  '#ef4444',
  CLOSED_RECENT_30: '#f97316',
  CLOSED_RECENT_90: '#eab308',
};

export const CLAIM_TYPES = ['lode', 'placer', 'mill_site', 'tunnel_site', 'unknown'];

export const INGESTION_STATUS_COLORS = {
  success: '#10b981',
  partial: '#f59e0b',
  error:   '#ef4444',
  running: '#3b82f6',
  never:   '#9ca3af',
};

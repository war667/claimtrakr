import React from 'react';
import { Popup } from 'react-leaflet';
import StatusBadge from '../Claims/StatusBadge';

export default function ClaimPopup({ properties }) {
  return (
    <Popup>
      <div style={{ minWidth: '180px', fontSize: '12px' }}>
        <div style={{ fontWeight: 700, marginBottom: '4px', fontFamily: 'monospace' }}>
          {properties.serial_nr}
        </div>
        <div style={{ marginBottom: '6px' }}>
          <StatusBadge status={properties.case_status} closedDt={properties.closed_dt} />
        </div>
        {properties.claim_name && (
          <div style={{ marginBottom: '3px' }}><strong>Name:</strong> {properties.claim_name}</div>
        )}
        {properties.claimant_name && (
          <div style={{ marginBottom: '3px' }}><strong>Claimant:</strong> {properties.claimant_name}</div>
        )}
        {properties.county && (
          <div style={{ marginBottom: '3px' }}>
            <strong>Location:</strong> {properties.county}, {properties.state}
          </div>
        )}
        {properties.closed_dt && (
          <div style={{ marginBottom: '3px' }}><strong>Closed:</strong> {properties.closed_dt}</div>
        )}
      </div>
    </Popup>
  );
}

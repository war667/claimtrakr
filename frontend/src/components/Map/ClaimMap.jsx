import React, { useMemo, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import { useQuery } from '@tanstack/react-query';
import { differenceInDays, parseISO } from 'date-fns';
import { fetchClaimsGeoJSON } from '../../api/claims';
import EmptyState from '../shared/EmptyState';

function getFeatureColor(props) {
  if (props.case_status === 'ACTIVE') return '#22c55e';
  if (props.closed_dt) {
    try {
      const days = differenceInDays(new Date(), parseISO(String(props.closed_dt)));
      if (days <= 7)  return '#ef4444';
      if (days <= 30) return '#f97316';
      if (days <= 90) return '#eab308';
    } catch (_) {}
  }
  return '#9ca3af';
}

function getFeatureOpacity(props) {
  if (props.case_status === 'ACTIVE') return 0.5;
  if (props.closed_dt) {
    try {
      const days = differenceInDays(new Date(), parseISO(String(props.closed_dt)));
      if (days <= 7)  return 0.6;
      if (days <= 30) return 0.55;
      if (days <= 90) return 0.5;
    } catch (_) {}
  }
  return 0.4;
}

function MapLegend() {
  return (
    <div style={{
      position: 'absolute', bottom: '30px', right: '10px', zIndex: 1000,
      background: 'rgba(255,255,255,0.95)', borderRadius: '6px',
      boxShadow: '0 1px 6px rgba(0,0,0,0.15)', padding: '10px 14px', fontSize: '12px',
    }}>
      <div style={{ fontWeight: 700, marginBottom: '6px', fontSize: '11px', textTransform: 'uppercase', color: '#6b7280' }}>
        Claim Status
      </div>
      {[
        { color: '#22c55e', label: 'Active' },
        { color: '#ef4444', label: 'Closed ≤ 7 days' },
        { color: '#f97316', label: 'Closed ≤ 30 days' },
        { color: '#eab308', label: 'Closed ≤ 90 days' },
        { color: '#9ca3af', label: 'Closed (older)' },
      ].map(({ color, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
          <span style={{ width: '12px', height: '12px', background: color, display: 'inline-block', borderRadius: '2px', opacity: 0.8 }} />
          {label}
        </div>
      ))}
    </div>
  );
}

export default function ClaimMap({ filters, onFeatureClick }) {
  const geoJsonRef = useRef();

  const queryParams = {
    ...(filters.state ? { state: filters.state } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.claim_type ? { claim_type: filters.claim_type } : {}),
    ...(filters.county ? { county: filters.county } : {}),
    ...(filters.closed_within_days ? { closed_within_days: filters.closed_within_days } : {}),
  };

  const { data: geojson, isLoading } = useQuery({
    queryKey: ['claimsGeoJSON', queryParams],
    queryFn: () => fetchClaimsGeoJSON(queryParams),
    staleTime: 60_000,
  });

  const featureCount = geojson?.features?.length ?? 0;

  const onEachFeature = (feature, layer) => {
    layer.on('click', () => onFeatureClick(feature.properties));
  };

  const style = (feature) => {
    const color = getFeatureColor(feature.properties);
    const opacity = getFeatureOpacity(feature.properties);
    return {
      fillColor: color,
      fillOpacity: opacity,
      color: color,
      weight: 1,
      opacity: 0.8,
    };
  };

  const geoJsonKey = useMemo(() => JSON.stringify(queryParams), [queryParams]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MapContainer
        center={[39.5, -114]}
        zoom={6}
        style={{ width: '100%', height: '100%' }}
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        {geojson && featureCount > 0 && (
          <GeoJSON
            key={geoJsonKey}
            data={geojson}
            style={style}
            onEachFeature={onEachFeature}
            ref={geoJsonRef}
          />
        )}
        <MapLegend />
      </MapContainer>

      {isLoading && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(255,255,255,0.6)', zIndex: 500,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ background: '#fff', padding: '16px 24px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', fontSize: '14px', color: '#374151' }}>
            Loading claim data...
          </div>
        </div>
      )}

      {!isLoading && featureCount === 0 && (
        <div style={{
          position: 'absolute', top: '80px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 500, background: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          padding: '12px 20px', fontSize: '13px', color: '#6b7280', textAlign: 'center',
        }}>
          No claims loaded. Trigger ingestion on the Ingestion page.
        </div>
      )}
    </div>
  );
}

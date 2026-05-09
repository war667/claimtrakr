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
  if (props.case_status === 'ACTIVE') return 0.65;
  if (props.closed_dt) {
    try {
      const days = differenceInDays(new Date(), parseISO(String(props.closed_dt)));
      if (days <= 7)  return 0.75;
      if (days <= 30) return 0.7;
      if (days <= 90) return 0.65;
    } catch (_) {}
  }
  return 0.55;
}

function MapLegend() {
  return (
    <div style={{
      position: 'absolute', bottom: '30px', right: '10px', zIndex: 1000,
      background: '#0f2039', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      padding: '10px 14px', fontSize: '12px',
    }}>
      <div style={{ fontWeight: 700, marginBottom: '6px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#06b6d4' }}>
        Claim Status
      </div>
      {[
        { color: '#22c55e', label: 'Active' },
        { color: '#ef4444', label: 'Closed ≤ 7 days' },
        { color: '#f97316', label: 'Closed ≤ 30 days' },
        { color: '#eab308', label: 'Closed ≤ 90 days' },
        { color: '#9ca3af', label: 'Closed (older)' },
      ].map(({ color, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', color: '#94a3b8' }}>
          <span style={{ width: '12px', height: '12px', background: color, display: 'inline-block', borderRadius: '2px', flexShrink: 0 }} />
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
    ...(filters.claim_types?.length ? { claim_type: filters.claim_types.join(',') } : {}),
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
      color: '#ffffff',
      weight: 2,
      opacity: 0.9,
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
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          maxZoom={20}
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
          background: 'rgba(0,0,0,0.5)', zIndex: 500,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ background: '#0f2039', border: '1px solid rgba(255,255,255,0.1)', padding: '16px 24px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.4)', fontSize: '14px', color: '#94a3b8' }}>
            Loading claim data...
          </div>
        </div>
      )}

      {!isLoading && featureCount === 0 && (
        <div style={{
          position: 'absolute', top: '80px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 500, background: '#0f2039', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          padding: '12px 20px', fontSize: '13px', color: '#94a3b8', textAlign: 'center',
        }}>
          No claims loaded. Trigger ingestion on the Ingestion page.
        </div>
      )}
    </div>
  );
}

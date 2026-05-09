import React, { useEffect, useRef, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useQuery } from '@tanstack/react-query';
import { differenceInDays, parseISO } from 'date-fns';
import { fetchClaimsGeoJSON } from '../../api/claims';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/fiord';

function escapeXml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ringToKmlCoords(ring) {
  return ring.map(([lon, lat]) => `${lon},${lat},0`).join(' ');
}

function geojsonToKml(geojson) {
  const placemarks = (geojson.features || []).map((f) => {
    const p = f.properties;
    const geom = f.geometry;
    if (!geom) return '';

    const rings = geom.type === 'Polygon'
      ? [geom.coordinates[0]]
      : geom.type === 'MultiPolygon'
        ? geom.coordinates.map((poly) => poly[0])
        : [];

    if (!rings.length) return '';

    const polygonsKml = rings.map((ring) => `
      <Polygon>
        <outerBoundaryIs><LinearRing>
          <coordinates>${ringToKmlCoords(ring)}</coordinates>
        </LinearRing></outerBoundaryIs>
      </Polygon>`).join('');

    const desc = [
      p.claim_name     && `Name: ${p.claim_name}`,
      p.claimant_name  && `Claimant: ${p.claimant_name}`,
      p.case_status    && `Status: ${p.case_status}`,
      p.county         && `County: ${p.county}, ${p.state}`,
      p.acres          && `Acres: ${p.acres}`,
      p.closed_dt      && `Closed: ${p.closed_dt}`,
    ].filter(Boolean).join('&#10;');

    const geometry = rings.length > 1
      ? `<MultiGeometry>${polygonsKml}</MultiGeometry>`
      : polygonsKml;

    return `
  <Placemark>
    <name>${escapeXml(p.serial_nr)}</name>
    <description>${escapeXml(desc)}</description>
    ${geometry}
  </Placemark>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>ClaimTrakr Export ${new Date().toISOString().slice(0, 10)}</name>
    ${placemarks}
  </Document>
</kml>`;
}

function downloadKml(geojson) {
  const kml = geojsonToKml(geojson);
  const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `claimtrakr_${new Date().toISOString().slice(0, 10)}.kml`;
  a.click();
  URL.revokeObjectURL(url);
}

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
      background: 'rgba(10,20,40,0.85)', border: '1px solid rgba(255,255,255,0.1)',
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
  const mapContainer = useRef(null);
  const map = useRef(null);
  const onClickRef = useRef(onFeatureClick);
  onClickRef.current = onFeatureClick;

  const queryParams = useMemo(() => ({
    ...(filters.state               ? { state: filters.state } : {}),
    ...(filters.status              ? { status: filters.status } : {}),
    ...(filters.claim_types?.length ? { claim_type: filters.claim_types.join(',') } : {}),
    ...(filters.county              ? { county: filters.county } : {}),
    ...(filters.closed_within_days  ? { closed_within_days: filters.closed_within_days } : {}),
  }), [filters]);

  const { data: geojson, isLoading } = useQuery({
    queryKey: ['claimsGeoJSON', queryParams],
    queryFn: () => fetchClaimsGeoJSON(queryParams),
    staleTime: 60_000,
  });

  const featureCount = geojson?.features?.length ?? 0;

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: STYLE_URL,
      center: [-114, 39.5],
      zoom: 6,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      map.current.addSource('claims', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.current.addLayer({
        id: 'claims-fill',
        type: 'fill',
        source: 'claims',
        paint: {
          'fill-color': ['get', '_color'],
          'fill-opacity': ['get', '_opacity'],
        },
      });

      map.current.addLayer({
        id: 'claims-border',
        type: 'line',
        source: 'claims',
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.4, 10, 1.2, 13, 2, 16, 3],
          'line-opacity': 0.85,
        },
      });

      map.current.on('click', 'claims-fill', (e) => {
        if (!e.features?.length) return;
        const props = { ...e.features[0].properties };
        delete props._color;
        delete props._opacity;
        onClickRef.current(props);
      });

      map.current.on('mouseenter', 'claims-fill', () => {
        map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'claims-fill', () => {
        map.current.getCanvas().style.cursor = '';
      });
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current || !geojson) return;

    const apply = () => {
      const source = map.current.getSource('claims');
      if (!source) return;
      source.setData({
        ...geojson,
        features: geojson.features.map((f) => ({
          ...f,
          properties: {
            ...f.properties,
            _color:   getFeatureColor(f.properties),
            _opacity: getFeatureOpacity(f.properties),
          },
        })),
      });
    };

    if (map.current.isStyleLoaded()) {
      apply();
    } else {
      map.current.once('load', apply);
    }
  }, [geojson]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      <MapLegend />

      <div style={{ position: 'absolute', bottom: '170px', right: '10px', zIndex: 1000 }}>
        <button
          onClick={() => geojson && downloadKml(geojson)}
          disabled={!geojson || featureCount === 0}
          title="Export current claims as KML for onX Maps"
          style={{
            background: featureCount > 0 ? '#2563eb' : '#334155',
            color: '#fff', border: 'none', borderRadius: '8px',
            padding: '8px 14px', fontSize: '12px', fontWeight: 600,
            cursor: featureCount > 0 ? 'pointer' : 'default',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
          }}
        >
          ⬇ Export KML {featureCount > 0 ? `(${featureCount.toLocaleString()})` : ''}
        </button>
      </div>

      {isLoading && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 500,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ background: '#0f2039', border: '1px solid rgba(255,255,255,0.1)', padding: '16px 24px', borderRadius: '8px', fontSize: '14px', color: '#94a3b8' }}>
            Loading claim data...
          </div>
        </div>
      )}

      {!isLoading && featureCount === 0 && (
        <div style={{
          position: 'absolute', top: '80px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 500, background: '#0f2039', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px', padding: '12px 20px', fontSize: '13px', color: '#94a3b8', textAlign: 'center',
        }}>
          No claims loaded. Trigger ingestion on the Ingestion page.
        </div>
      )}
    </div>
  );
}

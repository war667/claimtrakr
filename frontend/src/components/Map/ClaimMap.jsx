import React, { useEffect, useRef, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useQuery } from '@tanstack/react-query';
import { differenceInDays, parseISO } from 'date-fns';
import { fetchClaimsGeoJSON } from '../../api/claims';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

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

function roadColor(id) {
  if (id.includes('motorway') || id.includes('trunk'))  return '#2a8aaa';
  if (id.includes('primary'))                            return '#1a6b8a';
  if (id.includes('secondary'))                         return '#155870';
  if (id.includes('tertiary'))                          return '#0f4460';
  if (id.includes('street') || id.includes('local') || id.includes('minor')) return '#0d3a52';
  if (id.includes('path') || id.includes('track') || id.includes('service')) return '#0a2f45';
  return '#0d3a52';
}

function applyDarkTheme(map) {
  const layers = map.getStyle().layers || [];
  for (const layer of layers) {
    try {
      const { id, type } = layer;
      const sl = (layer['source-layer'] || '').toLowerCase();

      if (type === 'background') {
        map.setPaintProperty(id, 'background-color', '#071220');
      } else if (type === 'fill') {
        if (sl.includes('water')) {
          map.setPaintProperty(id, 'fill-color', '#0a1e35');
          map.setPaintProperty(id, 'fill-opacity', 1);
        } else if (sl.includes('park') || sl.includes('landuse') || sl.includes('landcover')) {
          map.setPaintProperty(id, 'fill-color', '#0c3040');
          map.setPaintProperty(id, 'fill-opacity', 0.7);
        } else if (sl.includes('building')) {
          map.setPaintProperty(id, 'fill-color', '#112a4a');
        } else {
          map.setPaintProperty(id, 'fill-color', '#0d2137');
        }
      } else if (type === 'line') {
        if (sl.includes('water')) {
          map.setPaintProperty(id, 'line-color', '#0a1e35');
        } else if (sl.includes('boundary') || sl.includes('admin')) {
          map.setPaintProperty(id, 'line-color', '#1e4d6b');
          map.setPaintProperty(id, 'line-opacity', 0.8);
        } else if (sl.includes('road') || sl.includes('transport')) {
          map.setPaintProperty(id, 'line-color', roadColor(id));
        } else {
          map.setPaintProperty(id, 'line-color', '#0a3550');
        }
      } else if (type === 'symbol') {
        try { map.setPaintProperty(id, 'text-color', '#c8e6f0'); } catch (_) {}
        try { map.setPaintProperty(id, 'text-halo-color', 'rgba(7,18,32,0.85)'); } catch (_) {}
        try { map.setPaintProperty(id, 'text-halo-width', 2); } catch (_) {}
        try { map.setPaintProperty(id, 'icon-color', '#c8e6f0'); } catch (_) {}
      }
    } catch (_) {}
  }
}

function MapLegend() {
  return (
    <div style={{
      position: 'absolute', bottom: '30px', right: '10px', zIndex: 1000,
      background: '#0f2039', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      padding: '10px 14px', fontSize: '12px', pointerEvents: 'none',
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
    ...(filters.state              ? { state: filters.state } : {}),
    ...(filters.status             ? { status: filters.status } : {}),
    ...(filters.claim_types?.length ? { claim_type: filters.claim_types.join(',') } : {}),
    ...(filters.county             ? { county: filters.county } : {}),
    ...(filters.closed_within_days ? { closed_within_days: filters.closed_within_days } : {}),
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
      applyDarkTheme(map.current);
      // Second pass: force all label layers readable regardless of style expressions
      for (const layer of map.current.getStyle().layers) {
        if (layer.type !== 'symbol') continue;
        try { map.current.setPaintProperty(layer.id, 'text-color', '#c8e6f0'); } catch (_) {}
        try { map.current.setPaintProperty(layer.id, 'text-halo-color', 'rgba(7,18,32,0.9)'); } catch (_) {}
        try { map.current.setPaintProperty(layer.id, 'text-halo-width', 2); } catch (_) {}
      }

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

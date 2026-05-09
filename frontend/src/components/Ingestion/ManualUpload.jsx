import React, { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { uploadFile } from '../../api/ingest';

const SAMPLE_CSV = `serial_nr,claim_name,claim_type,claimant_name,claimant_addr,state,county,meridian,township,township_dir,range,range_dir,section,aliquot,acres,case_status,disposition_cd,disposition_desc,location_dt,filing_dt,closed_dt,last_action_dt
NV900000001,EXAMPLE LODE 1,lode,SMITH JOHN,123 MAIN ST RENO NV 89501,NV,ELKO,MOUNT DIABLO,32,N,52,E,14,NESW,20.66,ACTIVE,,,2020-03-15,2020-03-20,,2020-03-20
NV900000002,EXAMPLE PLACER 1,placer,JONES MARY,,NV,LANDER,MOUNT DIABLO,18,N,44,E,6,,160.0,CLOSED,,,2018-06-01,2018-06-10,2023-01-01,2023-01-01
`;

const SAMPLE_GEOJSON = JSON.stringify({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[[-117.5, 40.2], [-117.4, 40.2], [-117.4, 40.3], [-117.5, 40.3], [-117.5, 40.2]]]
      },
      properties: {
        serial_nr: "NV900000003",
        claim_name: "EXAMPLE LODE 2",
        claim_type: "lode",
        claimant_name: "DOE JANE",
        state: "NV",
        county: "HUMBOLDT",
        acres: 20.66,
        case_status: "ACTIVE",
        location_dt: "2021-05-10",
        filing_dt: "2021-05-15"
      }
    }
  ]
}, null, 2);

function downloadSample(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ManualUpload() {
  const [file, setFile] = useState(null);
  const [sourceType, setSourceType] = useState('csv');
  const [notes, setNotes] = useState('');
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef();

  const uploadMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('source_type', sourceType);
      if (notes) fd.append('notes', notes);
      return uploadFile(fd);
    },
    onSuccess: (data) => {
      setResult(data);
      setFile(null);
    },
    onError: (e) => {
      setResult({ error: e.response?.data?.detail || 'Upload failed' });
    },
  });

  const handleFile = (f) => {
    setFile(f);
    setResult(null);
  };

  return (
    <div>
      <div
        style={{
          border: `2px dashed ${dragging ? '#2563eb' : 'rgba(255,255,255,0.12)'}`,
          borderRadius: '10px', padding: '24px', textAlign: 'center',
          cursor: 'pointer', background: dragging ? 'rgba(37,99,235,0.1)' : '#0a1628',
          marginBottom: '12px', transition: 'all 0.15s',
        }}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
        }}
      >
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>📂</div>
        <div style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 500 }}>
          {file ? file.name : 'Drag & drop CSV or GeoJSON, or click to browse'}
        </div>
        {file && (
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
            {(file.size / 1024).toFixed(1)} KB
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.geojson,.json"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
        />
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
        <span style={{ fontSize: '11px', color: '#4b6079' }}>Download sample:</span>
        <span
          onClick={() => downloadSample(SAMPLE_CSV, 'sample_claims.csv', 'text/csv')}
          style={{ fontSize: '11px', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}
        >
          CSV
        </span>
        <span
          onClick={() => downloadSample(SAMPLE_GEOJSON, 'sample_claims.geojson', 'application/json')}
          style={{ fontSize: '11px', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}
        >
          GeoJSON
        </span>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#06b6d4', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>
            Source Type
          </label>
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', fontSize: '13px', background: '#0a1628', color: '#ffffff' }}
          >
            <option value="csv">CSV</option>
            <option value="geojson">GeoJSON</option>
          </select>
        </div>
        <div style={{ flex: 2 }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#06b6d4', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>
            Notes (optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. BLM data export Jan 2025"
            style={{ width: '100%', padding: '7px 10px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', fontSize: '13px', background: '#0a1628', color: '#ffffff' }}
          />
        </div>
      </div>

      <button
        onClick={() => uploadMutation.mutate()}
        disabled={!file || uploadMutation.isPending}
        style={{
          background: !file ? '#334155' : '#2563eb', color: '#fff', border: 'none',
          borderRadius: '8px', padding: '8px 20px', fontSize: '14px',
          cursor: !file ? 'default' : 'pointer', fontWeight: 600,
        }}
      >
        {uploadMutation.isPending ? 'Uploading...' : 'Upload & Process'}
      </button>

      {result && (
        <div style={{
          marginTop: '14px', padding: '12px 16px', borderRadius: '6px',
          background: result.error ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
          border: `1px solid ${result.error ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
          fontSize: '13px',
        }}>
          {result.error ? (
            <span style={{ color: '#fca5a5' }}>❌ {result.error}</span>
          ) : (
            <div>
              <div style={{ color: '#86efac', fontWeight: 600, marginBottom: '4px' }}>
                ✓ Upload complete
              </div>
              <div style={{ color: '#94a3b8' }}>
                {result.accepted} accepted · {result.rejected} rejected · {result.errors} errors
                {result.run_id && ` · Run #${result.run_id}`}
              </div>
              {result.messages?.length > 0 && (
                <ul style={{ margin: '8px 0 0', padding: '0 0 0 18px', fontSize: '12px', color: '#ef4444' }}>
                  {result.messages.slice(0, 10).map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

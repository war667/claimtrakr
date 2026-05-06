import React, { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { uploadFile } from '../../api/ingest';

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
          border: `2px dashed ${dragging ? '#3b82f6' : '#e5e7eb'}`,
          borderRadius: '8px', padding: '24px', textAlign: 'center',
          cursor: 'pointer', background: dragging ? '#eff6ff' : '#fafafa',
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
        <div style={{ fontSize: '14px', color: '#374151', fontWeight: 500 }}>
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
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>
            Source Type
          </label>
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: '5px', fontSize: '13px' }}
          >
            <option value="csv">CSV</option>
            <option value="geojson">GeoJSON</option>
          </select>
        </div>
        <div style={{ flex: 2 }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>
            Notes (optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. BLM data export Jan 2025"
            style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: '5px', fontSize: '13px' }}
          />
        </div>
      </div>

      <button
        onClick={() => uploadMutation.mutate()}
        disabled={!file || uploadMutation.isPending}
        style={{
          background: !file ? '#9ca3af' : '#1e293b', color: '#fff', border: 'none',
          borderRadius: '5px', padding: '8px 20px', fontSize: '14px',
          cursor: !file ? 'default' : 'pointer', fontWeight: 600,
        }}
      >
        {uploadMutation.isPending ? 'Uploading...' : 'Upload & Process'}
      </button>

      {result && (
        <div style={{
          marginTop: '14px', padding: '12px 16px', borderRadius: '6px',
          background: result.error ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${result.error ? '#fca5a5' : '#86efac'}`,
          fontSize: '13px',
        }}>
          {result.error ? (
            <span style={{ color: '#991b1b' }}>❌ {result.error}</span>
          ) : (
            <div>
              <div style={{ color: '#166534', fontWeight: 600, marginBottom: '4px' }}>
                ✓ Upload complete
              </div>
              <div style={{ color: '#374151' }}>
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

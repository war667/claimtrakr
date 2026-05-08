import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchTargetFiles, uploadTargetFile, deleteTargetFile } from '../../api/targets';
import { format, parseISO } from 'date-fns';

const FILE_TYPES = ['photo', 'pdf', 'county_doc', 'gps', 'assay', 'other'];

export default function FileUpload({ targetId }) {
  const qc = useQueryClient();
  const fileInputRef = useRef();
  const [fileType, setFileType] = useState('other');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['targetFiles', targetId],
    queryFn: () => fetchTargetFiles(targetId),
  });

  const uploadMutation = useMutation({
    mutationFn: (fd) => uploadTargetFile(targetId, fd),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['targetFiles', targetId] });
      setError('');
    },
    onError: (e) => setError(e.response?.data?.detail || 'Upload failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId) => deleteTargetFile(targetId, fileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['targetFiles', targetId] }),
  });

  const handleFiles = (fileList) => {
    if (!fileList?.length) return;
    const fd = new FormData();
    fd.append('file', fileList[0]);
    fd.append('file_type', fileType);
    uploadMutation.mutate(fd);
  };

  return (
    <div>
      <div
        style={{
          border: `2px dashed ${dragging ? '#2563eb' : 'rgba(255,255,255,0.12)'}`,
          borderRadius: '8px',
          padding: '20px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? 'rgba(37,99,235,0.1)' : '#0a1628',
          transition: 'all 0.15s',
          marginBottom: '8px',
        }}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <div style={{ fontSize: '24px', marginBottom: '4px' }}>📁</div>
        <div style={{ fontSize: '13px', color: '#94a3b8' }}>
          Drag & drop or click to upload
        </div>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <select
          value={fileType}
          onChange={(e) => setFileType(e.target.value)}
          style={{
            flex: 1, padding: '5px 8px',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '6px', fontSize: '13px',
            background: '#0a1628', color: '#ffffff',
          }}
        >
          {FILE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {uploadMutation.isPending && (
        <div style={{ fontSize: '12px', color: '#2563eb', marginBottom: '8px' }}>Uploading...</div>
      )}
      {error && (
        <div style={{ fontSize: '12px', color: '#ef4444', marginBottom: '8px' }}>{error}</div>
      )}

      {!isLoading && files.length > 0 && (
        <div>
          <div style={{
            fontSize: '11px', fontWeight: 600, color: '#06b6d4',
            textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px',
          }}>
            Uploaded Files
          </div>
          {files.map((f) => (
            <div key={f.id} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 0',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              fontSize: '12px',
            }}>
              <span style={{ fontSize: '16px' }}>
                {f.file_type === 'photo' ? '📷' : f.file_type === 'pdf' ? '📄' : '📁'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, color: '#ffffff' }}>{f.filename}</div>
                <div style={{ color: '#4b6079' }}>
                  {f.file_type} · {f.uploaded_at ? format(parseISO(f.uploaded_at), 'MMM d, yyyy') : ''}
                  {f.file_size_bytes ? ` · ${(f.file_size_bytes / 1024).toFixed(1)} KB` : ''}
                </div>
              </div>
              <button
                onClick={() => deleteMutation.mutate(f.id)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#ef4444', fontSize: '16px', padding: '0 4px',
                }}
                title="Delete"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

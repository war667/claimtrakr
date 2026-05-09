import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await axios.get(`${BASE_URL}/api/v1/admin/me`, {
        auth: { username, password },
      });
      login(username, password, res.data.is_admin);
      navigate('/', { replace: true });
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Invalid username or password.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0a1628',
    }}>
      <div style={{
        background: '#0f2039',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px',
        padding: '36px 32px',
        width: '100%',
        maxWidth: '360px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>⛏</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff' }}>ClaimTrakr</div>
          <div style={{ fontSize: '12px', color: '#4b6079', marginTop: '4px' }}>UT / NV Mining Claims</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '6px', padding: '8px 12px', fontSize: '13px', color: '#ef4444',
              marginBottom: '14px',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!username || !password || loading}
            style={{
              width: '100%', background: '#2563eb', color: '#fff', border: 'none',
              borderRadius: '8px', padding: '10px', fontSize: '15px', fontWeight: 600,
              cursor: loading || !username || !password ? 'default' : 'pointer',
              opacity: !username || !password ? 0.5 : 1,
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '20px', fontSize: '11px', color: '#334155', textAlign: 'center' }}>
          Internal Use Only
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  fontSize: '11px', fontWeight: 600, color: '#06b6d4',
  display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em',
};

const inputStyle = {
  width: '100%', padding: '8px 10px', background: '#0d1f35', color: '#ffffff',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', fontSize: '14px',
  outline: 'none', boxSizing: 'border-box',
};

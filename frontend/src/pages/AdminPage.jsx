import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchMe, fetchUsers, createUser, updateUser, fetchLoginEvents } from '../api/admin';
import { format, parseISO } from 'date-fns';

function Section({ title, children }) {
  return (
    <div style={{
      background: '#0f2039',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px',
      padding: '16px',
      marginBottom: '20px',
    }}>
      <h3 style={{
        margin: '0 0 14px',
        fontSize: '11px', fontWeight: 600, color: '#06b6d4',
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function AdminPage() {
  const qc = useQueryClient();

  const { data: me, isLoading: meLoading } = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  const { data: users = [], isLoading: usersLoading } = useQuery({ queryKey: ['admin-users'], queryFn: fetchUsers });
  const { data: events = [] } = useQuery({ queryKey: ['login-events'], queryFn: fetchLoginEvents });

  const [newUser, setNewUser] = useState({ username: '', password: '', is_admin: false });
  const [newUserError, setNewUserError] = useState('');
  const [pwdModal, setPwdModal] = useState(null); // { id, username }
  const [newPwd, setNewPwd] = useState('');
  const [pwdError, setPwdError] = useState('');

  const createMutation = useMutation({
    mutationFn: () => createUser(newUser),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      setNewUser({ username: '', password: '', is_admin: false });
      setNewUserError('');
    },
    onError: (e) => setNewUserError(e.response?.data?.detail || 'Failed to create user'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => updateUser(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const pwdMutation = useMutation({
    mutationFn: ({ id, password }) => updateUser(id, { password }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      setPwdModal(null);
      setNewPwd('');
      setPwdError('');
    },
    onError: (e) => setPwdError(e.response?.data?.detail || 'Failed to update password'),
  });

  if (meLoading) return <div style={{ padding: '40px', color: '#4b6079', textAlign: 'center' }}>Loading...</div>;

  if (!me?.is_admin) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔒</div>
        <div style={{ color: '#ef4444', fontSize: '16px', fontWeight: 600 }}>Admin access required</div>
        <div style={{ color: '#4b6079', marginTop: '8px', fontSize: '13px' }}>
          Your account does not have admin privileges.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '20px 16px', overflowY: 'auto' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: '20px', fontWeight: 700, color: '#ffffff' }}>
        Admin Console
      </h2>

      {/* Users table */}
      <Section title="Users">
        {usersLoading ? (
          <div style={{ color: '#4b6079', fontSize: '13px' }}>Loading...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  {['Username', 'Admin', 'Status', 'Created', 'Actions'].map((h) => (
                    <th key={h} style={{
                      padding: '6px 10px', textAlign: 'left', fontSize: '11px',
                      color: '#06b6d4', fontWeight: 600, textTransform: 'uppercase',
                      letterSpacing: '0.04em', borderBottom: '1px solid rgba(255,255,255,0.08)',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '8px 10px', color: '#ffffff', fontWeight: 500 }}>{u.username}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <input
                        type="checkbox"
                        checked={u.is_admin}
                        disabled={u.username === me.username}
                        onChange={(e) => updateMutation.mutate({ id: u.id, body: { is_admin: e.target.checked } })}
                        style={{ accentColor: '#2563eb' }}
                      />
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{
                        fontSize: '11px', fontWeight: 600, borderRadius: '9999px',
                        padding: '2px 8px',
                        background: u.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                        color: u.is_active ? '#22c55e' : '#ef4444',
                        border: `1px solid ${u.is_active ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      }}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', color: '#4b6079', fontSize: '12px' }}>
                      {u.created_at ? format(parseISO(u.created_at), 'MMM d, yyyy') : '—'}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => { setPwdModal({ id: u.id, username: u.username }); setNewPwd(''); setPwdError(''); }}
                          style={actionBtnStyle}
                        >
                          Change Password
                        </button>
                        {u.username !== me.username && (
                          <button
                            onClick={() => updateMutation.mutate({ id: u.id, body: { is_active: !u.is_active } })}
                            style={{ ...actionBtnStyle, color: u.is_active ? '#ef4444' : '#22c55e' }}
                          >
                            {u.is_active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add user form */}
        <div style={{
          marginTop: '16px', paddingTop: '16px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end',
        }}>
          <div>
            <label style={labelStyle}>Username</label>
            <input
              value={newUser.username}
              onChange={(e) => setNewUser((u) => ({ ...u, username: e.target.value }))}
              placeholder="username"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={newUser.password}
              onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))}
              placeholder="password"
              style={inputStyle}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#94a3b8', paddingBottom: '6px' }}>
            <input
              type="checkbox"
              checked={newUser.is_admin}
              onChange={(e) => setNewUser((u) => ({ ...u, is_admin: e.target.checked }))}
              style={{ accentColor: '#2563eb' }}
            />
            Admin
          </label>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!newUser.username || !newUser.password || createMutation.isPending}
            style={{
              background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px',
              padding: '6px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              opacity: (!newUser.username || !newUser.password) ? 0.5 : 1,
              marginBottom: '0',
            }}
          >
            {createMutation.isPending ? 'Adding...' : '+ Add User'}
          </button>
          {newUserError && <div style={{ color: '#ef4444', fontSize: '12px', width: '100%' }}>{newUserError}</div>}
        </div>
      </Section>

      {/* Login events */}
      <Section title={`Login Events (last ${events.length})`}>
        {events.length === 0 ? (
          <div style={{ color: '#4b6079', fontSize: '13px', fontStyle: 'italic' }}>No login events yet.</div>
        ) : (
          <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['Time', 'Username', 'IP Address'].map((h) => (
                    <th key={h} style={{
                      padding: '5px 10px', textAlign: 'left', fontSize: '11px',
                      color: '#06b6d4', fontWeight: 600, textTransform: 'uppercase',
                      letterSpacing: '0.04em', borderBottom: '1px solid rgba(255,255,255,0.08)',
                      whiteSpace: 'nowrap', position: 'sticky', top: 0, background: '#0f2039',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '6px 10px', color: '#4b6079', whiteSpace: 'nowrap' }}>
                      {e.logged_at ? format(parseISO(e.logged_at), 'MMM d, yyyy HH:mm') : '—'}
                    </td>
                    <td style={{ padding: '6px 10px', color: '#ffffff', fontWeight: 500 }}>{e.username}</td>
                    <td style={{ padding: '6px 10px', color: '#94a3b8', fontFamily: 'monospace' }}>{e.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Change password modal */}
      {pwdModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#0f2039', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '12px', padding: '24px', width: '340px',
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: '#ffffff' }}>
              Change Password — {pwdModal.username}
            </h3>
            <label style={labelStyle}>New Password</label>
            <input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              autoFocus
              style={{ ...inputStyle, width: '100%', marginTop: '4px' }}
            />
            {pwdError && <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '6px' }}>{pwdError}</div>}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button
                onClick={() => pwdMutation.mutate({ id: pwdModal.id, password: newPwd })}
                disabled={!newPwd || pwdMutation.isPending}
                style={{
                  flex: 1, background: '#2563eb', color: '#fff', border: 'none',
                  borderRadius: '8px', padding: '8px', fontSize: '14px',
                  fontWeight: 600, cursor: 'pointer',
                  opacity: !newPwd ? 0.5 : 1,
                }}
              >
                {pwdMutation.isPending ? 'Saving...' : 'Save Password'}
              </button>
              <button
                onClick={() => { setPwdModal(null); setNewPwd(''); setPwdError(''); }}
                style={{
                  background: '#0d1f35', color: '#94a3b8',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px', padding: '8px 16px', fontSize: '14px', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle = {
  fontSize: '11px', fontWeight: 600, color: '#06b6d4',
  display: 'block', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.04em',
};

const inputStyle = {
  padding: '5px 8px', background: '#0d1f35', color: '#ffffff',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', fontSize: '13px',
};

const actionBtnStyle = {
  background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px',
  padding: '3px 10px', fontSize: '12px', color: '#94a3b8', cursor: 'pointer',
};

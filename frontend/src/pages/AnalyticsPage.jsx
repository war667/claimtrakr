import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAnalyticsSummary } from '../api/analytics';
import { useAuth } from '../contexts/AuthContext';
import { format, parseISO } from 'date-fns';

function Card({ label, value }) {
  return (
    <div style={{
      background: '#0f2039', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px', padding: '16px',
    }}>
      <div style={{ fontSize: '28px', fontWeight: 700, color: '#ffffff' }}>{value ?? 0}</div>
      <div style={{ fontSize: '11px', fontWeight: 600, color: '#06b6d4', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '4px' }}>{label}</div>
    </div>
  );
}

function SectionBox({ title, children }) {
  return (
    <div style={{
      background: '#0f2039', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px', padding: '16px', marginBottom: '20px',
    }}>
      <h3 style={{ margin: '0 0 14px', fontSize: '11px', fontWeight: 600, color: '#06b6d4', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Bar({ value, max, color = '#2563eb' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '12px', color: '#94a3b8', minWidth: '28px', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

const USER_COLORS = ['#2563eb', '#22c55e', '#f59e0b', '#06b6d4', '#a855f7', '#ef4444'];

export default function AnalyticsPage() {
  const { auth } = useAuth();
  const [selectedUser, setSelectedUser] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: fetchAnalyticsSummary,
    refetchInterval: 60_000,
  });

  if (auth?.username !== 'warr') {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔒</div>
        <div style={{ color: '#ef4444', fontSize: '16px', fontWeight: 600 }}>Access restricted</div>
      </div>
    );
  }

  if (isLoading) return <div style={{ padding: '40px', color: '#4b6079', textAlign: 'center' }}>Loading...</div>;

  const { total_views, by_page, by_day, by_user, by_user_page } = data;

  const uniqueUsers = by_user.length;
  const topPage = by_page[0]?.page || '—';
  const maxPageVisits = by_page[0]?.visits || 1;
  const maxDayVisits = Math.max(...by_day.map((d) => d.visits), 1);

  // Filter by_page by selected user
  const filteredByPage = selectedUser === 'all'
    ? by_page
    : by_user_page.filter((r) => r.username === selectedUser).sort((a, b) => b.visits - a.visits);
  const filteredMax = filteredByPage[0]?.visits || 1;

  // Group by_day by month for the month breakdown
  const byMonth = by_day.reduce((acc, { day, visits }) => {
    const month = day.substring(0, 7); // YYYY-MM
    acc[month] = (acc[month] || 0) + visits;
    return acc;
  }, {});

  return (
    <div style={{ padding: '24px', maxWidth: '1100px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#ffffff' }}>Usage Analytics</h1>
        <div style={{ fontSize: '12px', color: '#4b6079', marginTop: '4px' }}>Visible only to you</div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <Card label="Total Page Views" value={total_views?.toLocaleString()} />
        <Card label="Unique Users" value={uniqueUsers} />
        <Card label="Most Visited" value={topPage} />
        <Card label="Days Tracked" value={by_day.length} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '20px' }}>
        <div>
          {/* Page visits with user filter */}
          <SectionBox title="Page Visits">
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
              <button
                onClick={() => setSelectedUser('all')}
                style={{
                  background: selectedUser === 'all' ? '#2563eb' : '#0d1f35',
                  border: `1px solid ${selectedUser === 'all' ? '#2563eb' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: '9999px', padding: '3px 12px', fontSize: '11px',
                  color: selectedUser === 'all' ? '#fff' : '#94a3b8', cursor: 'pointer',
                }}
              >
                All users
              </button>
              {by_user.map((u, i) => (
                <button
                  key={u.username}
                  onClick={() => setSelectedUser(u.username)}
                  style={{
                    background: selectedUser === u.username ? USER_COLORS[i % USER_COLORS.length] : '#0d1f35',
                    border: `1px solid ${selectedUser === u.username ? USER_COLORS[i % USER_COLORS.length] : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: '9999px', padding: '3px 12px', fontSize: '11px',
                    color: selectedUser === u.username ? '#fff' : '#94a3b8', cursor: 'pointer',
                  }}
                >
                  {u.username}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredByPage.map((r) => (
                <div key={r.page}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', color: '#ffffff' }}>{r.page}</span>
                  </div>
                  <Bar value={r.visits} max={filteredMax} />
                </div>
              ))}
              {filteredByPage.length === 0 && (
                <div style={{ color: '#4b6079', fontSize: '13px', fontStyle: 'italic' }}>No data</div>
              )}
            </div>
          </SectionBox>

          {/* By user */}
          <SectionBox title="Views by User">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {by_user.map((u, i) => (
                <div key={u.username}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', color: '#ffffff' }}>{u.username}</span>
                  </div>
                  <Bar value={u.visits} max={by_user[0]?.visits || 1} color={USER_COLORS[i % USER_COLORS.length]} />
                </div>
              ))}
            </div>
          </SectionBox>
        </div>

        <div>
          {/* By month */}
          <SectionBox title="Views by Month">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {Object.entries(byMonth).sort().reverse().map(([month, visits]) => {
                const [year, m] = month.split('-');
                const label = format(new Date(parseInt(year), parseInt(m) - 1, 1), 'MMMM yyyy');
                const maxMonth = Math.max(...Object.values(byMonth));
                return (
                  <div key={month}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', color: '#ffffff' }}>{label}</span>
                    </div>
                    <Bar value={visits} max={maxMonth} color='#06b6d4' />
                  </div>
                );
              })}
            </div>
          </SectionBox>

          {/* Daily — last 30 days */}
          <SectionBox title="Daily Views (last 60 days)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[...by_day].reverse().map(({ day, visits }) => (
                <div key={day} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#4b6079', minWidth: '80px' }}>
                    {format(parseISO(day), 'MMM d')}
                  </span>
                  <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.round((visits / maxDayVisits) * 100)}%`, height: '100%', background: '#2563eb', borderRadius: '3px' }} />
                  </div>
                  <span style={{ fontSize: '11px', color: '#94a3b8', minWidth: '20px', textAlign: 'right' }}>{visits}</span>
                </div>
              ))}
              {by_day.length === 0 && (
                <div style={{ color: '#4b6079', fontSize: '13px', fontStyle: 'italic' }}>No data yet — navigate around and refresh</div>
              )}
            </div>
          </SectionBox>
        </div>
      </div>
    </div>
  );
}

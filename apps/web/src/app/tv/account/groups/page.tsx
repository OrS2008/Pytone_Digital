// Custom channel groups — create, rename, delete, and pick channels.
// Groups appear as filter chips above the live channel list.

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Shell from '../Shell';
import { useT } from '@/lib/i18n';
import { loadChannels } from '@/lib/channelCache';
import type { M3UChannel } from '@/lib/m3u';
import {
  createGroup, deleteGroup, getGroups, onGroupsChange, renameGroup, toggleInGroup,
  MAX_GROUPS, type ChannelGroup,
} from '@/lib/channelGroups';

export default function Groups() {
  const { t } = useT();
  const [groups, setGroups] = useState<ChannelGroup[]>([]);
  const [channels, setChannels] = useState<M3UChannel[] | null>(null);
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const refresh = useCallback(() => setGroups(getGroups()), []);
  useEffect(() => { refresh(); return onGroupsChange(refresh); }, [refresh]);
  useEffect(() => {
    let off = false;
    loadChannels().then((c) => { if (!off) setChannels(c); }).catch(() => { if (!off) setChannels([]); });
    return () => { off = true; };
  }, []);

  function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return;
    const g = createGroup(name);
    if (!g) { setErr(groups.length >= MAX_GROUPS ? t('groups.errMax') : t('groups.errName')); return; }
    setName('');
    setOpen(g.id);
  }

  return (
    <Shell active="groups">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">{t('groups.eyebrow')}</div>
        <h1 className="ac-panel-title">{t('groups.title')}</h1>
        <p className="ac-panel-sub">{t('groups.sub')}</p>
      </header>

      <div className="ac-card">
        <div className="ac-card-title">{t('groups.new')}</div>
        <form onSubmit={add} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            className="ac-input"
            style={{ flex: '1 1 220px' }}
            placeholder={t('groups.namePh')}
            aria-label={t('groups.namePh')}
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="ac-btn ac-btn-primary">{t('groups.create')}</button>
        </form>
        {err && <div className="ac-form-error" role="alert" style={{ marginTop: 10 }}>{err}</div>}
      </div>

      {groups.length === 0 && (
        <p style={{ color: 'var(--ns-text-faint)', fontSize: 14 }}>{t('groups.none')}</p>
      )}

      {groups.map((g) => (
        <GroupCard
          key={g.id}
          group={g}
          channels={channels}
          open={open === g.id}
          onToggleOpen={() => setOpen(open === g.id ? null : g.id)}
        />
      ))}

      {groups.length > 0 && (
        <p style={{ fontSize: 13, color: 'var(--ns-text-muted)' }}>
          {t('groups.whereShown')} <Link href="/tv/live" className="ac-auth-link">{t('nav.live')}</Link>
        </p>
      )}
    </Shell>
  );
}

function GroupCard({ group, channels, open, onToggleOpen }: {
  group: ChannelGroup; channels: M3UChannel[] | null; open: boolean; onToggleOpen: () => void;
}) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(group.name);
  const [armed, setArmed] = useState(false);
  const [err, setErr] = useState(false);

  const members = useMemo(() => new Set(group.channels), [group.channels]);
  const byId = useMemo(() => new Map((channels ?? []).map((c) => [c.id, c])), [channels]);
  const memberList = group.channels.map((id) => byId.get(id)).filter((c): c is M3UChannel => !!c);
  const missing = channels ? group.channels.length - memberList.length : 0;
  const results = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!channels || n.length < 1) return [];
    return channels.filter((c) =>
      c.name.toLowerCase().includes(n) || c.category.toLowerCase().includes(n) || String(c.number) === n,
    ).slice(0, 40);
  }, [q, channels]);

  return (
    <div className="ac-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {renaming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (renameGroup(group.id, newName)) { setRenaming(false); setErr(false); } else setErr(true);
            }}
            style={{ display: 'flex', gap: 8, flex: 1, flexWrap: 'wrap' }}
          >
            <input className="ac-input" style={{ flex: '1 1 180px' }} maxLength={40} value={newName}
              aria-label={t('groups.rename')} onChange={(e) => setNewName(e.target.value)} autoFocus />
            <button type="submit" className="ac-btn ac-btn-sm ac-btn-primary">{t('groups.save')}</button>
            <button type="button" className="ac-btn ac-btn-sm" onClick={() => { setRenaming(false); setNewName(group.name); setErr(false); }}>{t('groups.cancel')}</button>
          </form>
        ) : (
          <div className="ac-card-title" style={{ margin: 0, flex: 1, minWidth: 0 }}>
            <bdi>{group.name}</bdi> · {group.channels.length}
          </div>
        )}
        {!renaming && (
          <>
            <button type="button" className="ac-btn ac-btn-sm" onClick={onToggleOpen} aria-expanded={open}>
              {open ? t('groups.done') : t('groups.addChannels')}
            </button>
            <button type="button" className="ac-btn ac-btn-sm" onClick={() => setRenaming(true)}>{t('groups.rename')}</button>
            <button
              type="button"
              className="ac-btn ac-btn-sm"
              onClick={() => { if (!armed) { setArmed(true); return; } deleteGroup(group.id); }}
              onBlur={() => setArmed(false)}
            >{armed ? t('dev.confirm') : t('groups.delete')}</button>
          </>
        )}
      </div>
      {err && <div className="ac-form-error" role="alert" style={{ marginTop: 8 }}>{t('groups.errName')}</div>}

      {memberList.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {memberList.map((c) => (
            <button
              key={c.id}
              type="button"
              className="ac-chip-remove"
              onClick={() => toggleInGroup(group.id, c.id)}
              aria-label={`${t('groups.remove')}: ${c.name}`}
              title={t('groups.remove')}
            >
              <bdi>{c.name}</bdi> <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
      {missing > 0 && (
        <p style={{ marginTop: 10, color: 'var(--ns-text-faint)', fontSize: 13 }}>
          {t('groups.missing').replace('{n}', String(missing))}
        </p>
      )}

      {open && (
        <div style={{ marginTop: 14 }}>
          {channels === null ? (
            <p style={{ color: 'var(--ns-text-muted)', fontSize: 14 }}>{t('search.loading')}</p>
          ) : channels.length === 0 ? (
            <p style={{ color: 'var(--ns-text-muted)', fontSize: 14 }}>
              {t('groups.noChannels')} <Link href="/tv/account/sources" className="ac-auth-link">{t('acc.sources')}</Link>
            </p>
          ) : (
            <>
              <input
                className="ac-input"
                type="search"
                placeholder={t('groups.searchPh')}
                aria-label={t('groups.searchPh')}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                {results.map((c) => {
                  const on = members.has(c.id);
                  return (
                    <button
                      key={c.id + '-' + c.number}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleInGroup(group.id, c.id)}
                      className="ac-group-pick"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, textAlign: 'start',
                        padding: '10px 12px', borderRadius: 10, cursor: 'pointer', font: 'inherit',
                        background: on ? 'rgba(255,59,110,0.12)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${on ? 'var(--ns-accent, #FF3B6E)' : 'rgba(255,255,255,0.08)'}`,
                        color: 'inherit',
                      }}
                    >
                      <span aria-hidden="true" style={{ width: 18, fontWeight: 700, color: on ? 'var(--ns-accent, #FF3B6E)' : 'var(--ns-text-faint)' }}>{on ? '✓' : '+'}</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <bdi>{c.name}</bdi>
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--ns-text-faint)', whiteSpace: 'nowrap' }}>#{c.number}{c.category ? ` · ${c.category}` : ''}</span>
                    </button>
                  );
                })}
                {q.trim() && results.length === 0 && (
                  <p style={{ color: 'var(--ns-text-faint)', fontSize: 13 }}>{t('search.noResults')}</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

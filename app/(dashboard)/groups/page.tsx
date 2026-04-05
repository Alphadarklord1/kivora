'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/useI18n';
import { parseFlashcards } from '@/lib/srs/parse';
import { buildImportedDeck, persistDeckLocally } from '@/lib/srs/deck-utils';
import { useToast } from '@/providers/ToastProvider';

interface GroupDeck {
  id: string;
  deckName: string;
  cardCount: number;
  content: string;
  shareToken: string | null;
  addedAt: string;
  addedByName: string;
  addedByMe: boolean;
}

interface GroupNote {
  id: string;
  content: string;
  postedAt: string;
  authorName: string;
  isOwn: boolean;
  isGroupOwner: boolean;
}

interface Group {
  id: string;
  name: string;
  description: string | null;
  joinCode: string;
  isOwner: boolean;
  memberCount: number;
  deckCount: number;
  createdAt: string;
  decks: GroupDeck[];
}

export default function GroupsPage() {
  const { t } = useI18n();
  const { toast: notify_ } = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [requiresAccount, setRequiresAccount] = useState(false);

  // Create group state
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // Join group state
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  // Per-group tab: 'decks' | 'notes'
  const [groupTab, setGroupTab] = useState<Record<string, 'decks' | 'notes'>>({});
  // Notes state: notes per group id, loading, draft
  const [groupNotes, setGroupNotes] = useState<Record<string, GroupNote[]>>({});
  const [notesLoading, setNotesLoading] = useState<Record<string, boolean>>({});
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [notePosting, setNotePosting] = useState<Record<string, boolean>>({});
  const [lastNotesRefresh, setLastNotesRefresh] = useState<Record<string, string>>({});
  const [inviteCode, setInviteCode] = useState('');

  function notify(msg: string, kind: 'ok' | 'err' = 'ok') {
    notify_(msg, kind === 'ok' ? 'success' : 'error');
  }

  async function loadGroups() {
    setLoading(true);
    setRequiresAccount(false);
    try {
      const res = await fetch('/api/groups', { credentials: 'include' });
      if (res.status === 401) {
        setGroups([]);
        setRequiresAccount(true);
        return;
      }
      if (res.ok) setGroups(await res.json() as Group[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadGroups(); }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = new URLSearchParams(window.location.search).get('join')?.trim().toUpperCase() ?? '';
    setInviteCode(raw.length === 6 ? raw : '');
  }, []);

  useEffect(() => {
    if (!inviteCode) return;
    setShowJoin(true);
    setShowCreate(false);
    setJoinCode(inviteCode);
  }, [inviteCode]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/groups', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: createName.trim(), description: createDesc.trim() || undefined }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        notify(t('Group created!'));
        setCreateName(''); setCreateDesc(''); setShowCreate(false);
        await loadGroups();
      } else { notify(data.error ?? t('Failed to create group.'), 'err'); }
    } finally { setCreating(false); }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (joinCode.trim().length !== 6) { notify(t('Enter a valid 6-character group code.'), 'err'); return; }
    setJoining(true);
    try {
      const res = await fetch('/api/groups/join', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: joinCode.trim().toUpperCase() }),
      });
      const data = await res.json() as { ok?: boolean; alreadyMember?: boolean; error?: string };
      if (data.ok) {
        notify(data.alreadyMember ? t('You\'re already in that group.') : t('Joined group!'));
        setJoinCode(''); setShowJoin(false);
        await loadGroups();
      } else { notify(data.error ?? t('Could not join group.'), 'err'); }
    } finally { setJoining(false); }
  }

  async function handleLeaveOrDelete(group: Group) {
    const action = group.isOwner ? t('delete this group') : t('leave this group');
    if (!confirm(`${t('Are you sure you want to')} ${action}?`)) return;
    const res = await fetch(`/api/groups/${group.joinCode}`, {
      method: 'DELETE', credentials: 'include',
    });
    const data = await res.json() as { ok?: boolean; error?: string };
    if (data.ok) {
      notify(group.isOwner ? t('Group deleted.') : t('Left group.'));
      await loadGroups();
    } else { notify(data.error ?? t('Failed.'), 'err'); }
  }

  async function removeDeck(group: Group, deck: GroupDeck) {
    if (!confirm(t('Remove deck') + ` "${deck.deckName}"?`)) return;
    const res = await fetch(`/api/groups/${group.joinCode}/decks?deckId=${deck.id}`, {
      method: 'DELETE', credentials: 'include',
    });
    const data = await res.json() as { ok?: boolean; error?: string };
    if (data.ok) { notify(t('Deck removed.')); await loadGroups(); }
    else { notify(data.error ?? t('Failed.'), 'err'); }
  }

  async function loadNotes(group: Group) {
    setNotesLoading(p => ({ ...p, [group.id]: true }));
    try {
      const res = await fetch(`/api/groups/${group.joinCode}/notes`, { credentials: 'include' });
      if (res.ok) {
        const notes = await res.json() as GroupNote[];
        setGroupNotes(p => ({ ...p, [group.id]: notes }));
        setLastNotesRefresh((prev) => ({ ...prev, [group.id]: new Date().toISOString() }));
      }
    } finally { setNotesLoading(p => ({ ...p, [group.id]: false })); }
  }

  function switchTab(groupId: string, tab: 'decks' | 'notes', group: Group) {
    setGroupTab(p => ({ ...p, [groupId]: tab }));
    if (tab === 'notes' && !groupNotes[groupId]) void loadNotes(group);
  }

  useEffect(() => {
    const activeGroup = groups.find((group) => group.id === expanded);
    if (!activeGroup) return;
    if ((groupTab[activeGroup.id] ?? 'decks') !== 'notes') return;

    const timer = window.setInterval(() => {
      void loadNotes(activeGroup);
    }, 15000);

    return () => window.clearInterval(timer);
  }, [expanded, groupTab, groups]);

  async function postNote(group: Group) {
    const content = noteDraft[group.id]?.trim();
    if (!content) return;
    setNotePosting(p => ({ ...p, [group.id]: true }));
    try {
      const res = await fetch(`/api/groups/${group.joinCode}/notes`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        setNoteDraft(p => ({ ...p, [group.id]: '' }));
        await loadNotes(group);
      } else { notify(data.error ?? t('Failed.'), 'err'); }
    } finally { setNotePosting(p => ({ ...p, [group.id]: false })); }
  }

  async function deleteNote(group: Group, noteId: string) {
    const res = await fetch(`/api/groups/${group.joinCode}/notes?noteId=${noteId}`, {
      method: 'DELETE', credentials: 'include',
    });
    const data = await res.json() as { ok?: boolean; error?: string };
    if (data.ok) await loadNotes(group);
    else notify(data.error ?? t('Failed.'), 'err');
  }

  async function importDeck(deck: GroupDeck) {
    const cards = parseFlashcards(deck.content);
    if (!cards.length) { notify(t('No cards found in this deck.'), 'err'); return; }
    const built = buildImportedDeck({ title: deck.deckName, cards, content: deck.content, sourceType: 'kivora-share', creatorName: '' });
    if (!built) { notify(t('Failed to build deck.'), 'err'); return; }
    persistDeckLocally(built);
    notify(`"${deck.deckName}" — ${t('{count} cards', { count: deck.cardCount })} ${t('Import').toLowerCase()}`);
  }

  async function copyInviteLink(group: Group) {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      await navigator.clipboard.writeText(`${origin}/groups?join=${group.joinCode}`);
      notify(t('Invite link copied!'));
    } catch {
      notify(t('Could not copy invite link.'), 'err');
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-2)',
    background: 'var(--surface)', color: 'var(--text)', fontSize: 14,
  };

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 20px 80px' }}>


      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 800 }}>{t('Study Groups')}</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-3)', fontSize: 14 }}>
            {t('Share decks, group notes, and async study handoffs with classmates.')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setShowJoin(v => !v); setShowCreate(false); }}>
            {t('Join group')}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => { setShowCreate(v => !v); setShowJoin(false); }}>
            {t('+ New group')}
          </button>
        </div>
      </div>

      {requiresAccount && (
        <div style={{
          background: 'rgba(79, 134, 247, 0.08)',
          border: '1px solid rgba(79, 134, 247, 0.2)',
          borderRadius: 12,
          padding: '16px 18px',
          marginBottom: 20,
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{t('Groups need a signed-in account')}</div>
          <div style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.5 }}>
            {t('Guest mode is great for solo study, but shared groups and deck collaboration use your cloud account. Sign in first, then create or join a group.')}
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && !requiresAccount && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 12, padding: '20px', marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>{t('Create a study group')}</h3>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input style={fieldStyle} placeholder={t('Group name (e.g. Bio 101 Study Squad)')} value={createName}
              onChange={e => setCreateName(e.target.value)} required maxLength={80} />
            <input style={fieldStyle} placeholder={t('Description (optional)')} value={createDesc}
              onChange={e => setCreateDesc(e.target.value)} maxLength={240} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>{t('Cancel')}</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>
                {creating ? t('Creating…') : t('Create group')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Join form */}
      {showJoin && !requiresAccount && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 12, padding: '20px', marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>{t('Join a group')}</h3>
          <form onSubmit={handleJoin} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-2)', marginBottom: 4 }}>{t('6-character group code')}</label>
              <input style={{ ...fieldStyle, fontFamily: 'monospace', letterSpacing: 3, textTransform: 'uppercase', fontSize: 18 }}
                placeholder="ABC123" value={joinCode} maxLength={6}
                onChange={e => setJoinCode(e.target.value.toUpperCase())} required />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowJoin(false)}>{t('Cancel')}</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={joining}>
                {joining ? t('Joining…') : t('Join')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Groups list */}
      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: '48px 0' }}>{t('Loading groups…')}</div>
      ) : requiresAccount ? (
        <div style={{ textAlign: 'center', padding: '64px 20px', color: 'var(--text-3)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔐</div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{t('Sign in to use study groups')}</p>
          <p style={{ margin: '8px 0 0', fontSize: 14 }}>{t('Groups are tied to your account so decks and members stay in sync.')}</p>
        </div>
      ) : groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 20px', color: 'var(--text-3)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{t('No groups yet')}</p>
          <p style={{ margin: '6px 0 0', fontSize: 14 }}>{t('Create one to share decks, or ask a classmate for their group code.')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groups.map(group => (
            <div key={group.id} style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 12, overflow: 'hidden' }}>
              {/* Group header */}
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setExpanded(v => v === group.id ? null : group.id)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{group.name}</span>
                    {group.isOwner && (
                      <span style={{ fontSize: 10, background: 'var(--primary)', color: '#fff', padding: '2px 7px', borderRadius: 99, fontWeight: 700 }}>
                        {t('owner')}
                      </span>
                    )}
                  </div>
                  {group.description && (
                    <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {group.description}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 12, color: 'var(--text-3)' }}>
                    <span>👤 {group.memberCount} member{group.memberCount !== 1 ? 's' : ''}</span>
                    <span>🃏 {group.deckCount} deck{group.deckCount !== 1 ? 's' : ''}</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)', letterSpacing: 1 }}>
                      Code: {group.joinCode}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={e => { e.stopPropagation(); void navigator.clipboard.writeText(group.joinCode); notify(t('Code copied!')); }}
                    title={t('Copy code')}
                  >
                    {t('Copy code')}
                  </button>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={e => { e.stopPropagation(); void copyInviteLink(group); }}
                    title={t('Copy invite link')}
                  >
                    {t('Invite link')}
                  </button>
                  <button
                    className="btn btn-ghost btn-xs"
                    style={{ color: 'var(--error, #ef4444)' }}
                    onClick={e => { e.stopPropagation(); void handleLeaveOrDelete(group); }}
                    title={group.isOwner ? t('Delete') : t('Leave')}
                  >
                    {group.isOwner ? t('Delete') : t('Leave')}
                  </button>
                  <span style={{ color: 'var(--text-3)', fontSize: 18 }}>{expanded === group.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Expanded panel */}
              {expanded === group.id && (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  {/* Tab bar */}
                  <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
                    {(['decks', 'notes'] as const).map(tab => (
                      <button
                        key={tab}
                        className="btn btn-ghost btn-sm"
                        style={{
                          borderRadius: 0, fontWeight: (groupTab[group.id] ?? 'decks') === tab ? 700 : 400,
                          borderBottom: (groupTab[group.id] ?? 'decks') === tab ? '2px solid var(--primary)' : '2px solid transparent',
                          fontSize: 13, padding: '8px 16px',
                        }}
                        onClick={() => switchTab(group.id, tab, group)}
                      >
                        {tab === 'decks' ? `🃏 ${t('Decks')} (${group.decks.length})` : `📝 ${t('Notes')}`}
                      </button>
                    ))}
                  </div>

                  {/* Decks tab */}
                  {(groupTab[group.id] ?? 'decks') === 'decks' && (
                    <div style={{ padding: '12px 18px' }}>
                      {group.decks.length === 0 ? (
                        <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 14, padding: '8px 0' }}>
                          {t('No decks shared yet. Open a deck in Flashcards and use "Share to Group" to add one.')}
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {group.decks.map(deck => (
                            <div key={deck.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 14 }}>{deck.deckName}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                                  {t('{count} cards', { count: deck.cardCount })}
                                  {' · '}
                                  {t('Shared by {name}', { name: deck.addedByName })}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                <button className="btn btn-primary btn-xs" onClick={() => void importDeck(deck)}>
                                  {t('Import')}
                                </button>
                                {(deck.addedByMe || group.isOwner) && (
                                  <button
                                    className="btn btn-ghost btn-xs"
                                    style={{ color: 'var(--error, #ef4444)' }}
                                    onClick={() => void removeDeck(group, deck)}
                                    title={t('Remove deck')}
                                  >✕</button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notes tab */}
                  {groupTab[group.id] === 'notes' && (
                    <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                          {lastNotesRefresh[group.id]
                            ? `${t('Updated')} ${new Date(lastNotesRefresh[group.id]).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                            : t('Auto-refreshes every 15 seconds')}
                        </span>
                        <button className="btn btn-ghost btn-xs" onClick={() => void loadNotes(group)} disabled={notesLoading[group.id]}>
                          {notesLoading[group.id] ? t('Refreshing…') : `↻ ${t('Refresh')}`}
                        </button>
                      </div>
                      {/* Post new note */}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <textarea
                          style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, resize: 'vertical', minHeight: 60 }}
                          placeholder={t('Write a note for the group…')}
                          value={noteDraft[group.id] ?? ''}
                          maxLength={2000}
                          onChange={e => setNoteDraft(p => ({ ...p, [group.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void postNote(group); }}
                        />
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ alignSelf: 'flex-end' }}
                          disabled={!noteDraft[group.id]?.trim() || notePosting[group.id]}
                          onClick={() => void postNote(group)}
                        >
                          {notePosting[group.id] ? '…' : t('Post')}
                        </button>
                      </div>

                      {/* Notes list */}
                      {notesLoading[group.id] ? (
                        <p style={{ color: 'var(--text-3)', fontSize: 13 }}>{t('Loading…')}</p>
                      ) : (groupNotes[group.id] ?? []).length === 0 ? (
                        <p style={{ color: 'var(--text-3)', fontSize: 13, padding: '4px 0' }}>
                          {t('No notes yet. Be the first to post one.')}
                        </p>
                      ) : (
                        (groupNotes[group.id] ?? []).map(note => (
                          <div key={note.id} style={{ background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', padding: '10px 14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{note.authorName}</span>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                                  {new Date(note.postedAt).toLocaleDateString()}
                                </span>
                                {(note.isOwn || note.isGroupOwner) && (
                                  <button
                                    className="btn btn-ghost btn-xs"
                                    style={{ color: 'var(--error, #ef4444)', padding: '1px 6px' }}
                                    onClick={() => void deleteNote(group, note.id)}
                                  >✕</button>
                                )}
                              </div>
                            </div>
                            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{note.content}</p>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

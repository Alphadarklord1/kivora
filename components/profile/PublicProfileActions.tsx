'use client';

import { useMemo, useState } from 'react';

const FOLLOW_KEY = 'kivora_followed_profiles';
const BOOKMARK_KEY = 'kivora_bookmarked_profiles';

function readIds(key: string) {
  if (typeof window === 'undefined') return [] as string[];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(ids));
}

export function PublicProfileActions({ profileId, profileUrl }: { profileId: string; profileUrl: string }) {
  const [followedIds, setFollowedIds] = useState<string[]>(() => readIds(FOLLOW_KEY));
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() => readIds(BOOKMARK_KEY));
  const [copyState, setCopyState] = useState('');

  const isFollowed = useMemo(() => followedIds.includes(profileId), [followedIds, profileId]);
  const isBookmarked = useMemo(() => bookmarkedIds.includes(profileId), [bookmarkedIds, profileId]);

  function toggleState(key: string, ids: string[], setIds: (ids: string[]) => void) {
    const next = ids.includes(profileId) ? ids.filter((id) => id !== profileId) : [...ids, profileId];
    setIds(next);
    writeIds(key, next);
  }

  async function copyProfileLink() {
    try {
      const absoluteUrl = profileUrl.startsWith('/') ? `${window.location.origin}${profileUrl}` : profileUrl;
      await navigator.clipboard.writeText(absoluteUrl);
      setCopyState('Profile link copied');
      window.setTimeout(() => setCopyState(''), 1800);
    } catch {
      setCopyState('Could not copy link');
      window.setTimeout(() => setCopyState(''), 1800);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => toggleState(FOLLOW_KEY, followedIds, setFollowedIds)}
      >
        {isFollowed ? 'Following' : 'Follow'}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => toggleState(BOOKMARK_KEY, bookmarkedIds, setBookmarkedIds)}
      >
        {isBookmarked ? 'Bookmarked' : 'Bookmark'}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyProfileLink()}>
        Copy profile link
      </button>
      {copyState ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{copyState}</span> : null}
    </div>
  );
}

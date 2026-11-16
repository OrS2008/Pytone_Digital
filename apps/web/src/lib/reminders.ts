'use client';

// EPG reminders. A reminder is a future programme the user asked to be
// told about. Stored per account under a synced key (serverSync
// SYNCED_KEYS) so a reminder set on the phone also fires on the TV.
// Fired by <ReminderWatcher/> (mounted in the /tv layout) while the app
// is open — there is no push service, so a closed app cannot remind.

import { userKey } from './session';

export interface Reminder {
  key:     string;   // `${channelNumber}|${start}`
  ch:      string;   // channel number (deep link /tv/live?ch=)
  channel: string;   // channel name, for the message
  title:   string;
  start:   number;   // ms epoch
  stop:    number;
}

const KEY = 'epg.reminders';
const MAX = 100;
export const REMINDERS_EVENT = 'ns-reminders';

export const reminderKey = (ch: string | number, start: number) => `${ch}|${start}`;

export function listReminders(): Reminder[] {
  if (typeof window === 'undefined') return [];
  try {
    const v = JSON.parse(localStorage.getItem(userKey(KEY)) || '[]');
    if (!Array.isArray(v)) return [];
    return v.filter((r): r is Reminder =>
      r && typeof r.key === 'string' && typeof r.start === 'number' && typeof r.title === 'string');
  } catch { return []; }
}

function write(list: Reminder[]) {
  // Drop reminders whose programme has ended; keep the soonest MAX.
  const now = Date.now();
  const kept = list.filter((r) => r.stop > now).sort((a, b) => a.start - b.start).slice(0, MAX);
  try {
    localStorage.setItem(userKey(KEY), JSON.stringify(kept));
    window.dispatchEvent(new Event(REMINDERS_EVENT));
  } catch { /* storage unavailable */ }
}

export function hasReminder(key: string): boolean {
  return listReminders().some((r) => r.key === key);
}

/** Adds or removes the reminder; returns true when it is now set. */
export function toggleReminder(r: Omit<Reminder, 'key'>): boolean {
  const key = reminderKey(r.ch, r.start);
  const list = listReminders();
  if (list.some((x) => x.key === key)) { write(list.filter((x) => x.key !== key)); return false; }
  write([...list, { ...r, key }]);
  return true;
}

export function removeReminder(key: string) {
  write(listReminders().filter((r) => r.key !== key));
}

export function onRemindersChange(cb: () => void): () => void {
  window.addEventListener(REMINDERS_EVENT, cb);
  window.addEventListener('ns-settings-synced', cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(REMINDERS_EVENT, cb);
    window.removeEventListener('ns-settings-synced', cb);
    window.removeEventListener('storage', cb);
  };
}

/** Lead time: reminders fire this long before the programme starts. */
export const REMIND_LEAD_MS = 60_000;

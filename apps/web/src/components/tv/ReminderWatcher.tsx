'use client';

// Fires EPG reminders (lib/reminders) while the app is open: an in-app
// toast with "Watch now", plus a system notification when the page is
// in the background and the user granted permission. Mounted once in
// the /tv layout.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n';
import { listReminders, onRemindersChange, removeReminder, REMIND_LEAD_MS, type Reminder } from '@/lib/reminders';

const TICK_MS = 15_000;

function clock(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function ReminderWatcher() {
  const { t } = useT();
  const router = useRouter();
  const [due, setDue] = useState<Reminder[]>([]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      const now = Date.now();
      const list = listReminders();
      const firing = list.filter((r) => r.start - REMIND_LEAD_MS <= now && r.stop > now);
      // Reminders whose programme already ended while the app was closed
      // are dropped silently.
      for (const r of list) if (r.stop <= now) removeReminder(r.key);
      if (firing.length) {
        for (const r of firing) {
          removeReminder(r.key);
          try {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
              const n = new Notification(r.title, { body: `${r.channel} · ${clock(r.start)}`, tag: r.key });
              n.onclick = () => { window.focus(); router.push(`/tv/live?ch=${encodeURIComponent(r.ch)}`); n.close(); };
            }
          } catch { /* notifications unavailable (e.g. Android WebView) */ }
        }
        setDue((d) => [...d.filter((x) => !firing.some((f) => f.key === x.key)), ...firing]);
      }
      // Wake up exactly when the next reminder is due (bounded by TICK_MS).
      const next = listReminders().map((r) => r.start - REMIND_LEAD_MS - now).filter((d) => d > 0);
      const wait = Math.min(TICK_MS, ...(next.length ? next : [TICK_MS]));
      timer = setTimeout(check, Math.max(250, wait));
    };
    check();
    const off = onRemindersChange(() => { if (timer) clearTimeout(timer); check(); });
    return () => { off(); if (timer) clearTimeout(timer); };
  }, [router]);

  if (!due.length) return null;
  return (
    <div className="ns-reminder-stack" role="region" aria-label={t('reminders.region')}>
      {due.map((r) => (
        <div key={r.key} className="ns-reminder-toast" role="alert">
          <div className="ns-reminder-text">
            <div className="ns-reminder-kicker">
              {r.start > Date.now() ? t('reminders.startsSoon') : t('reminders.startedNow')}
            </div>
            <div className="ns-reminder-title">{r.title}</div>
            <div className="ns-reminder-sub">{r.channel} · {clock(r.start)}</div>
          </div>
          <div className="ns-reminder-actions">
            <button
              type="button"
              className="ns-reminder-watch"
              onClick={() => {
                setDue((d) => d.filter((x) => x.key !== r.key));
                router.push(`/tv/live?ch=${encodeURIComponent(r.ch)}`);
              }}
            >{t('reminders.watchNow')}</button>
            <button
              type="button"
              className="ns-reminder-dismiss"
              aria-label={t('reminders.dismiss')}
              onClick={() => setDue((d) => d.filter((x) => x.key !== r.key))}
            >✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}

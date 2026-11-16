// Playback preferences.
//
// Every control on this screen actually drives the player. New
// settings here also need a matching read site somewhere downstream
// (PlayerSurface for hls.js bindings, etc.) — otherwise they belong in
// the roadmap card.
//
// Today's working set:
//   * prefs.prefetchNeighbours  — LivePreviewTile pre-warms ±1 channel
//   * prefs.spoilerProtection   — EPG hides scores when on
//   * prefs.audioLang           — hls.js preferred audio track
//   * prefs.subtitleLang        — hls.js preferred subtitle track
//   * prefs.maxQuality          — hls.js capLevelToPlayerSize + maxAutoLevel
//
// Subtitle styling lives in SubtitleControls (its own localStorage
// keys read by the player).

'use client';

import Link from 'next/link';
import Shell from '../Shell';
import Toggle from '@/components/ui/Toggle';
import SubtitleControls from '@/components/ui/SubtitleControls';
import { useT } from '@/lib/i18n';
import usePersisted from '@/lib/usePersisted';


// Common ISO-639-1 languages first, plus "off" for subtitles. The
// player matches the M3U manifest's audio / subtitle track names
// against this code; if no match we fall through to whatever the
// stream defaults to.
const AUDIO_LANGS = [
  { value: '', label: 'pref.auto' },
  { value: 'en', label: 'English' },
  { value: 'he', label: 'Hebrew · עברית' },
  { value: 'ar', label: 'Arabic · العربية' },
  { value: 'ru', label: 'Russian · Русский' },
  { value: 'fr', label: 'French · Français' },
  { value: 'es', label: 'Spanish · Español' },
  { value: 'de', label: 'German · Deutsch' },
  { value: 'it', label: 'Italian · Italiano' },
  { value: 'pt', label: 'Portuguese · Português' },
  { value: 'tr', label: 'Turkish · Türkçe' },
];
const SUBTITLE_LANGS = [
  { value: 'off', label: 'pref.subsOff' },
  { value: '',    label: 'pref.subsAuto' },
  { value: 'en', label: 'English' },
  { value: 'he', label: 'Hebrew · עברית' },
  { value: 'ar', label: 'Arabic · العربية' },
  { value: 'ru', label: 'Russian · Русский' },
  { value: 'fr', label: 'French · Français' },
  { value: 'es', label: 'Spanish · Español' },
];
const QUALITY_OPTIONS = [
  { value: 'auto',   label: 'pref.q.auto' },
  { value: '1080',   label: 'pref.q.1080' },
  { value: '720',    label: 'pref.q.720' },
  { value: '480',    label: 'pref.q.480' },
  { value: 'audio',  label: 'pref.q.audio' },
];

// Option labels that start with 'pref.' are i18n keys; language names
// are shown in their own script and stay as written.
const label = (t: (k: string) => string, l: string) => (l.startsWith('pref.') ? t(l) : l);

export default function Preferences() {
  const { t } = useT();
  const [audioLang,    setAudioLang]    = usePersisted<string>('prefs.audioLang',    '');
  const [subtitleLang, setSubtitleLang] = usePersisted<string>('prefs.subtitleLang', 'off');
  const [maxQuality,   setMaxQuality]   = usePersisted<string>('prefs.maxQuality',   'auto');

  return (
    <Shell active="preferences">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">{t('pref.eyebrow')}</div>
        <h1 className="ac-panel-title">{t('pref.title')}</h1>
        <p className="ac-panel-sub">
          {t('pref.sub')}
        </p>
      </header>

      <div className="ac-card">
        <div className="ac-card-title">{t('pref.live')}</div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">{t('pref.prewarm')}</div>
            <div className="ac-toggle-desc">
              {t('pref.prewarmDesc')}
            </div>
          </div>
          <Toggle persistKey="prefs.prefetchNeighbours" initialOn />
        </div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">{t('pref.hideDead')}</div>
            <div className="ac-toggle-desc">
              {t('pref.hideDeadDesc')}
            </div>
          </div>
          <Toggle persistKey="prefs.autoHideDead" />
        </div>
        <div className="ac-toggle-row">
          <div>
            <div className="ac-toggle-title">{t('pref.spoiler')}</div>
            <div className="ac-toggle-desc">
              {t('pref.spoilerDesc')}
            </div>
          </div>
          <Toggle persistKey="prefs.spoilerProtection" />
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">{t('pref.languages')}</div>
        <div className="ac-field">
          <label className="ac-field-label">{t('pref.audio')}</label>
          <select
            className="ac-input"
            value={audioLang}
            onChange={(e) => setAudioLang(e.target.value)}
          >
            {AUDIO_LANGS.map((o) => <option key={o.value || 'auto'} value={o.value}>{label(t, o.label)}</option>)}
          </select>
          <div className="ac-field-help">
            {t('pref.audioHelp')}
          </div>
        </div>
        <div className="ac-field">
          <label className="ac-field-label">{t('pref.subs')}</label>
          <select
            className="ac-input"
            value={subtitleLang}
            onChange={(e) => setSubtitleLang(e.target.value)}
          >
            {SUBTITLE_LANGS.map((o) => <option key={o.value || 'auto'} value={o.value}>{label(t, o.label)}</option>)}
          </select>
          <div className="ac-field-help">
            {t('pref.subsHelp')}
          </div>
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">{t('pref.bandwidth')}</div>
        <div className="ac-field">
          <label className="ac-field-label">{t('pref.maxQuality')}</label>
          <select
            className="ac-input"
            value={maxQuality}
            onChange={(e) => setMaxQuality(e.target.value)}
          >
            {QUALITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{label(t, o.label)}</option>)}
          </select>
          <div className="ac-field-help">
            {t('pref.maxQualityHelp')}
          </div>
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">{t('pref.subLook')}</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, marginTop: 0 }}>
          {t('pref.subLookBody')}
        </p>
        <SubtitleControls />
      </div>

      <div className="ac-card">
        <div className="ac-card-title">{t('pref.streamMode')}</div>
        <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, margin: '0 0 6px' }}>
          {t('pref.streamModeBody')}{' '}
          <Link href="/tv/account/sources" className="ac-auth-link">{t('pref.sourcesLink')}</Link>{t('pref.page') === '.' ? '.' : ` ${t('pref.page')}`}
        </p>
      </div>

    </Shell>
  );
}

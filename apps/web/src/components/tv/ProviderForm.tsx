'use client';

// Add an Xtream Codes or Stalker/MAG connection. The credentials are sent
// once to /api/providers, verified with the provider, and stored
// encrypted on the server — they are not kept in the browser.

import { useState } from 'react';
import { useT } from '@/lib/i18n';
import { addProvider, type PublicProvider } from '@/lib/providersClient';

export default function ProviderForm({ type, onAdded }: { type: 'xtream' | 'stalker'; onAdded: (p: PublicProvider) => void }) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mac, setMac] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const config: Record<string, string> = type === 'xtream' ? { server, username, password } : { portal: server, mac };
      const { provider } = await addProvider({ type, name, config });
      setPassword('');
      onAdded(provider);
      setName(''); setServer(''); setUsername(''); setMac('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ltr = { dir: 'ltr' as const, autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false };
  return (
    <form onSubmit={submit} aria-busy={busy}>
      <div className="ac-field">
        <label className="ac-field-label" htmlFor="pf-name">{t('src.friendly')}</label>
        <input id="pf-name" className="ac-input" placeholder={t('src.friendlyPh')} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </div>
      <div className="ac-field">
        <label className="ac-field-label" htmlFor="pf-server">{type === 'xtream' ? t('prov.server') : t('prov.portal')}</label>
        <input id="pf-server" className="ac-input" required inputMode="url" {...ltr}
          placeholder={type === 'xtream' ? 'http://provider.tv:8080' : 'http://portal.tv/stalker_portal/c/'}
          value={server} onChange={(e) => setServer(e.target.value)} />
      </div>
      {type === 'xtream' ? (
        <>
          <div className="ac-field">
            <label className="ac-field-label" htmlFor="pf-user">{t('prov.username')}</label>
            <input id="pf-user" className="ac-input" required autoComplete="username" {...ltr} value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="ac-field">
            <label className="ac-field-label" htmlFor="pf-pass">{t('prov.password')}</label>
            <input id="pf-pass" className="ac-input" required type="password" autoComplete="current-password" {...ltr} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </>
      ) : (
        <div className="ac-field">
          <label className="ac-field-label" htmlFor="pf-mac">{t('prov.mac')}</label>
          <input id="pf-mac" className="ac-input" required {...ltr} placeholder="00:1A:79:12:34:56" value={mac} onChange={(e) => setMac(e.target.value)} />
          <div className="ac-field-help">{t('prov.macHelp')}</div>
        </div>
      )}
      <div className="ac-field-help">{t('prov.secureNote')}</div>
      {error && <div className="ac-form-error" role="alert">{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <button type="submit" className="ac-btn ac-btn-primary" disabled={busy}>
          {busy ? t('prov.connecting') : t('prov.connect')}
        </button>
      </div>
    </form>
  );
}

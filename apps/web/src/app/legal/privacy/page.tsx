// Privacy policy for Nova Stream.
//
// Aligned with GDPR Articles 13-22 (transparency, access, erasure,
// portability), with explicit mention of Cloudflare as our
// sub-processor since all server-side data lives in Cloudflare KV.
// The data-rights buttons live in /tv/account/help → Danger zone and
// call /api/privacy/export and /api/privacy/delete.
//
// Keep the language short and concrete. Boilerplate "we may collect
// data" policies are useless under GDPR Art. 13 — the user has to be
// able to tell, from this page, exactly what we hold.

import Link from 'next/link';
import '../../tv/account/account.css';

export default function Privacy() {
  return (
    <main className="ac-auth" style={{ alignItems: 'flex-start', padding: '64px 24px' }}>
      <div className="ac-auth-card" style={{ maxWidth: 760 }}>
        <div className="ac-auth-wm">NOVA STREAM</div>
        <h1 className="ac-auth-title" style={{ marginTop: 12 }}>Privacy policy</h1>
        <p className="ac-auth-sub" style={{ marginBottom: 24 }}>
          Last updated · {new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>

        <section style={{ lineHeight: 1.7 }}>
          <h3 style={{ marginTop: 28 }}>The short version</h3>
          <p>
            Nova Stream is a player. We do not host video. We do not
            sell your data. We do not place advertising trackers. The
            only personal data we hold is what we need to give you an
            account that follows you between devices.
          </p>

          <h3 style={{ marginTop: 28 }}>What we collect — exhaustive list</h3>
          <ul>
            <li>
              <b>Account:</b> email address and a salted PBKDF2 password
              hash. We never see your plain-text password.
            </li>
            <li>
              <b>Settings blob:</b> the M3U / EPG / Xtream URLs you typed
              into the app, your display preferences, parental-control
              settings, list of recently watched titles, and scheduled
              recordings. This is the data that synchronises across your
              devices.
            </li>
            <li>
              <b>Session cookie:</b> a random 32-byte token that
              identifies your device as signed in. HTTP-only, Secure,
              SameSite=Strict. 30-day lifetime.
            </li>
            <li>
              <b>Diagnostic logs:</b> when a request fails on the server,
              we log the URL path, HTTP status, and IP address for up to
              7 days so we can debug the issue. We do not log request
              bodies.
            </li>
          </ul>

          <h3 style={{ marginTop: 28 }}>What we don't collect</h3>
          <p>
            Microphone, camera, contacts, browsing history outside the
            app, third-party analytics SDKs (no Google Analytics, no
            Facebook Pixel, no Sentry user identifiers). We do not place
            advertising trackers. We do not log the URLs of the video
            segments your player fetches from your provider — those
            requests, when going through the proxy, are streamed and
            never written to disk on our side.
          </p>

          <h3 style={{ marginTop: 28 }}>Where it lives</h3>
          <p>
            All server-side data is stored in <b>Cloudflare KV</b>, a
            globally replicated key-value store operated by Cloudflare,
            Inc. on our behalf. Cloudflare is a sub-processor under
            their{' '}
            <a className="ac-auth-link" href="https://www.cloudflare.com/cloudflare-customer-dpa/">
              Customer Data Processing Addendum
            </a>
            . If you are in the EU/EEA we can on request configure your
            account to use a KV namespace pinned to EU jurisdiction.
          </p>

          <h3 style={{ marginTop: 28 }}>How long we keep it</h3>
          <p>
            Your account and settings stay until you delete them. Session
            cookies expire after 30 days of inactivity. Diagnostic logs
            roll off after 7 days.
          </p>

          <h3 style={{ marginTop: 28 }}>Your rights (GDPR Articles 15–22)</h3>
          <ul>
            <li>
              <b>Access &amp; portability (Art. 15 / 20):</b> click{' '}
              <Link href="/tv/account/help" className="ac-auth-link">
                Settings → Help &amp; legal → Export my data
              </Link>{' '}
              to download a JSON file containing everything we hold on
              you. Available immediately, not in 30 days.
            </li>
            <li>
              <b>Erasure (Art. 17):</b> click{' '}
              <Link href="/tv/account/help" className="ac-auth-link">
                Settings → Help &amp; legal → Delete my account
              </Link>
              . Your account, settings, sessions, and all derived data
              are removed within 30 days. Anonymised aggregate metrics
              (e.g. total daily active users) are retained.
            </li>
            <li>
              <b>Rectification (Art. 16):</b> edit any field directly in
              Settings, or write to privacy@novastream.tv.
            </li>
            <li>
              <b>Complaint (Art. 77):</b> you have the right to lodge a
              complaint with your local data-protection authority. In
              Israel that is the Privacy Protection Authority; in the EU
              the relevant national supervisor.
            </li>
          </ul>

          <h3 style={{ marginTop: 28 }}>Children</h3>
          <p>
            The service is not directed at children under 13. We do not
            knowingly collect personal data from children under 13. If
            you believe a child has created an account, write to
            privacy@novastream.tv and we will delete it.
          </p>

          <h3 style={{ marginTop: 28 }}>Changes to this policy</h3>
          <p>
            If we change this policy materially we will notify you in
            the app at least 30 days before the change takes effect.
          </p>

          <h3 style={{ marginTop: 28 }}>Contact</h3>
          <p>
            privacy@novastream.tv — for any question about this policy
            or to exercise your rights.
          </p>
        </section>

        <div className="ac-auth-bottom" style={{ marginTop: 40 }}>
          <Link href="/tv/signup" className="ac-auth-link">← Back to sign-up</Link>
        </div>
      </div>
    </main>
  );
}

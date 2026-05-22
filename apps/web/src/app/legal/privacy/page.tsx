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
          <h3 style={{ marginTop: 28 }}>What we collect</h3>
          <ul>
            <li><b>Account:</b> email, password hash, device fingerprints, subscription state.</li>
            <li><b>Usage:</b> what you watched and for how long, used for recommendations and to
            improve the catalogue. We do not sell this data.</li>
            <li><b>Network:</b> IP and approximate location, used to defend the account from
            credential-stuffing attacks and to choose the closest edge CDN.</li>
          </ul>

          <h3 style={{ marginTop: 28 }}>What we don't collect</h3>
          <p>Microphone, camera, contacts, browsing history outside the app, third-party
          analytics SDKs. We do not place advertising trackers.</p>

          <h3 style={{ marginTop: 28 }}>Your rights (GDPR Articles 15–22)</h3>
          <p>From Settings → Help &amp; legal → Danger zone you can request a full export
          of your data (delivered within 30 days) or permanently delete the account
          (removed within 30 days, retained for billing-record purposes for the
          legally required period).</p>

          <h3 style={{ marginTop: 28 }}>Children</h3>
          <p>The service is not directed at children under 13. Profiles flagged as
          children's profiles are subject to the Parental controls in Settings.</p>

          <h3 style={{ marginTop: 28 }}>Contact</h3>
          <p>privacy@novastream.tv — for any question about this policy or to exercise
          your rights, including filing a complaint with your local supervisory
          authority.</p>
        </section>

        <div className="ac-auth-bottom" style={{ marginTop: 40 }}>
          <Link href="/tv/signup" className="ac-auth-link">← Back to sign-up</Link>
        </div>
      </div>
    </main>
  );
}

// Minimal legal pages so the signup link does not 404. Real legal copy
// is owned by counsel; this is the placeholder used until that lands.
import Link from 'next/link';
import '../../tv/account/account.css';

export default function Terms() {
  return (
    <main className="ac-auth" style={{ alignItems: 'flex-start', padding: '64px 24px' }}>
      <div className="ac-auth-card" style={{ maxWidth: 760 }}>
        <div className="ac-auth-wm">NOVA STREAM</div>
        <h1 className="ac-auth-title" style={{ marginTop: 12 }}>Terms of service</h1>
        <p className="ac-auth-sub" style={{ marginBottom: 24 }}>
          Last updated · {new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>

        <section style={{ lineHeight: 1.7 }}>
          <h3 style={{ marginTop: 28 }}>1. The service</h3>
          <p>Nova Stream provides personal-use IPTV, video-on-demand and cloud DVR. You
          may use it on up to the number of concurrent devices included in your plan.</p>

          <h3 style={{ marginTop: 28 }}>2. Your account</h3>
          <p>One account per person. Sharing credentials is not permitted and may
          trigger the device-limit lockout. You can delete the account at any time
          from Settings → Help → Danger zone.</p>

          <h3 style={{ marginTop: 28 }}>3. Trial &amp; billing</h3>
          <p>A 7-day free trial begins when you click the activation link in the
          email we send. After it ends, billing is monthly in advance. You can
          cancel at any moment — access continues until the end of the paid period.</p>

          <h3 style={{ marginTop: 28 }}>4. Content</h3>
          <p>Channels and titles available on Nova Stream are sourced from third-party
          rights-holders. We make no warranty that any particular title remains
          available throughout your subscription.</p>

          <h3 style={{ marginTop: 28 }}>5. Acceptable use</h3>
          <p>You will not redistribute, rebroadcast, or commercially exploit
          content. Recording is permitted for private viewing within the 14-day
          rolling window.</p>

          <h3 style={{ marginTop: 28 }}>6. Liability</h3>
          <p>Service is provided as-is. Our liability is capped at the amount you
          paid in the trailing twelve months. None of this affects statutory
          consumer rights.</p>

          <h3 style={{ marginTop: 28 }}>7. Changes</h3>
          <p>If we change these terms materially we'll notify you in the app at
          least 30 days before they take effect.</p>
        </section>

        <div className="ac-auth-bottom" style={{ marginTop: 40 }}>
          <Link href="/tv/signup" className="ac-auth-link">← Back to sign-up</Link>
        </div>
      </div>
    </main>
  );
}

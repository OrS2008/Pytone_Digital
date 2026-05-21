// Sign-up screen. Email + password only — the activation link arrives by
// email, opens /tv/activate, which starts the 7-day trial.
import Link from 'next/link';
import '../account/account.css';

export default function Signup() {
  return (
    <main className="ac-auth">
      <div className="ac-auth-card">
        <div className="ac-auth-wm">NOVA STREAM</div>
        <h1 className="ac-auth-title">Start watching</h1>
        <p className="ac-auth-sub">
          7 days free. No card needed. One email per account.
        </p>

        <div className="ac-field">
          <label className="ac-field-label">Email</label>
          <input className="ac-input" type="email" placeholder="you@example.com" autoFocus />
          <div className="ac-field-help">We'll send an activation link. Your trial starts when you click it.</div>
        </div>
        <div className="ac-field">
          <label className="ac-field-label">Password</label>
          <input className="ac-input" type="password" placeholder="At least 10 characters" />
          <div className="ac-field-help">Long passwords beat complex ones. We check against leaked databases.</div>
        </div>

        <div style={{
          fontSize: 12, color: 'var(--ns-text-faint)',
          padding: '12px 0', display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <input type="checkbox" defaultChecked style={{ marginTop: 4 }} />
          <div>
            I agree to the <Link href="/legal/terms" className="ac-auth-link">Terms</Link> and the{' '}
            <Link href="/legal/privacy" className="ac-auth-link">Privacy policy</Link>. You can delete your account at any time from Settings → Account.
          </div>
        </div>

        <button className="ac-btn ac-btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '16px' }}>
          Create account &amp; start trial
        </button>

        <div className="ac-auth-bottom">
          Already have an account? <Link href="/tv/login" className="ac-auth-link">Sign in</Link>
        </div>
      </div>
    </main>
  );
}

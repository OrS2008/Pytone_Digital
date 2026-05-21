// Sign-in screen.
import Link from 'next/link';
import '../account/account.css';

export default function Login() {
  return (
    <main className="ac-auth">
      <div className="ac-auth-card">
        <div className="ac-auth-wm">NOVA STREAM</div>
        <h1 className="ac-auth-title">Welcome back</h1>
        <p className="ac-auth-sub">Sign in to keep watching where you left off.</p>

        <div className="ac-field">
          <label className="ac-field-label">Email</label>
          <input className="ac-input" type="email" placeholder="you@example.com" autoFocus />
        </div>
        <div className="ac-field">
          <label className="ac-field-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Password</span>
            <Link href="/tv/forgot-password" className="ac-auth-link" style={{ fontSize: 12 }}>Forgot?</Link>
          </label>
          <input className="ac-input" type="password" placeholder="At least 10 characters" />
        </div>

        <button className="ac-btn ac-btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '16px' }}>
          Sign in
        </button>

        <div className="ac-auth-bottom">
          New here? <Link href="/tv/signup" className="ac-auth-link">Create an account</Link> · 7 days free
        </div>
      </div>
    </main>
  );
}

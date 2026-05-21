// Subscription — current plan, next billing, payment method, history,
// cancel.
import Shell from '../Shell';

const INVOICES = [
  { id: 'inv_8FQK29B', date: 'Aug 14, 2026', amount: '₪39.00', plan: 'Single · month', status: 'Paid' },
  { id: 'inv_8FNB12C', date: 'Jul 14, 2026', amount: '₪39.00', plan: 'Single · month', status: 'Paid' },
  { id: 'inv_8FJG7XR', date: 'Jun 14, 2026', amount: '₪39.00', plan: 'Single · month', status: 'Paid' },
  { id: 'inv_8FAB29C', date: 'May 21, 2026', amount: '₪0.00',  plan: 'Trial · activated', status: 'Free' },
];

export default function Subscription() {
  return (
    <Shell active="subscription">
      <header className="ac-panel-head">
        <div className="ac-panel-eyebrow">Subscription</div>
        <h1 className="ac-panel-title">Your plan</h1>
        <p className="ac-panel-sub">Trial active. You haven't been charged. Pick a paid plan any time to keep watching when the trial ends.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
        <div className="ac-card">
          <div className="ac-card-title">Current plan</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6 }}>
            <h2 style={{ margin: 0, fontSize: 36, fontWeight: 800, letterSpacing: -1 }}>Free Trial</h2>
            <span className="ac-pill"><span className="ac-pill-dot" />Trial</span>
          </div>
          <p style={{ color: 'var(--ns-text-muted)', fontSize: 14, marginBottom: 22 }}>
            7-day trial. 1 concurrent device. All features unlocked.
          </p>
          <dl className="ac-detail">
            <dt>Trial started</dt><dd>May 14, 2026</dd>
            <dt>Trial ends</dt><dd>May 21, 2026 · 21:00 (5 days left)</dd>
            <dt>Device limit</dt><dd>1 of 1 used</dd>
            <dt>Cost so far</dt><dd>₪0.00</dd>
          </dl>
          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            <a className="ac-btn ac-btn-primary" href="/tv/account/plans">Choose a paid plan</a>
            <a className="ac-btn ac-btn-ghost" href="#">Cancel trial</a>
          </div>
        </div>

        <div>
          <div className="ac-card">
            <div className="ac-card-title">Payment method</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 0' }}>
              <div style={{
                width: 56, height: 36, borderRadius: 6,
                background: 'var(--ns-bg-hover)',
                border: '1px solid var(--ns-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: 'var(--ns-text-faint)',
                letterSpacing: 1,
              }}>VISA</div>
              <div>
                <div style={{ fontWeight: 600 }}>•••• 4242</div>
                <div style={{ color: 'var(--ns-text-faint)', fontSize: 12 }}>Expires 12 / 2028</div>
              </div>
            </div>
            <button className="ac-btn ac-btn-sm" style={{ marginTop: 12 }}>Update card</button>
          </div>
          <div className="ac-card">
            <div className="ac-card-title">Billing email</div>
            <div style={{ marginBottom: 10 }}>ors2008@gmail.com</div>
            <button className="ac-btn ac-btn-sm">Change</button>
          </div>
        </div>
      </div>

      <div className="ac-card">
        <div className="ac-card-title">Invoices</div>
        {INVOICES.map((inv, i) => (
          <div key={inv.id} style={{
            display: 'grid',
            gridTemplateColumns: '140px 1fr 100px 100px 100px',
            gap: 16, padding: '14px 0', alignItems: 'center',
            borderTop: i === 0 ? '0' : '1px solid var(--ns-hairline)',
            fontSize: 14,
          }}>
            <div style={{ color: 'var(--ns-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{inv.date}</div>
            <div>{inv.plan}</div>
            <div style={{ fontFamily: 'var(--ns-font-mono)', color: 'var(--ns-text-faint)', fontSize: 12 }}>{inv.id}</div>
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{inv.amount}</div>
            <div style={{ textAlign: 'right' }}>
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: 1,
                color: inv.status === 'Paid' ? 'var(--ns-ok)' : 'var(--ns-text-muted)',
              }}>{inv.status.toUpperCase()}</span>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

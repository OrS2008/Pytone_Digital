// Design exploration index. Five complete visual directions for the
// Live TV screen, all rendering the same mock channels + EPG so the user
// can compare apples-to-apples. Each variant is a self-contained tsx +
// css pair under /tv/design/{variant}/.

export const dynamic = 'force-static';

const VARIANTS = [
  { id: 'apex',     name: 'Apex Dark',         tagline: 'Refined signature. Deep black + magenta. Apple TV / Disney+ inspired.' },
  { id: 'aurora',   name: 'Aurora Glass',      tagline: 'Frosted glass over an aurora gradient. VisionOS / iOS 18.' },
  { id: 'mono',     name: 'Editorial Mono',    tagline: 'Pure black & white + acid-lime accent. Vogue / NYT cover energy.' },
  { id: 'cyber',    name: 'Cyber HUD',         tagline: 'Cyan neon on jet black, monospaced numerals, angular cuts.' },
  { id: 'premium',  name: 'Premium Charcoal',  tagline: 'Warm charcoal + brushed gold. Quiet luxury.' },
];

export default function DesignIndex() {
  return (
    <main style={{
      padding: 64,
      maxWidth: 1200,
      margin: '0 auto',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#E9EBF1',
    }}>
      <h1 style={{ fontSize: 56, fontWeight: 800, letterSpacing: -1.5, margin: 0 }}>
        Five design directions
      </h1>
      <p style={{ marginTop: 12, fontSize: 18, color: '#B7BEC9', maxWidth: 720 }}>
        Same Live TV screen, same mock EPG. Pick the one that feels right —
        we ship it as the production theme.
      </p>

      <div style={{ marginTop: 48, display: 'grid', gap: 16 }}>
        {VARIANTS.map((v, i) => (
          <a
            key={v.id}
            href={`/tv/design/${v.id}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '80px 1fr 120px',
              gap: 24,
              alignItems: 'center',
              padding: '24px 28px',
              borderRadius: 14,
              background: '#0E1015',
              border: '1px solid #1B1E27',
              color: 'inherit',
              textDecoration: 'none',
            }}
          >
            <div style={{
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 800,
              fontSize: 40,
              color: '#FF3B6E',
              letterSpacing: -1,
            }}>{String(i + 1).padStart(2, '0')}</div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{v.name}</div>
              <div style={{ fontSize: 15, color: '#B7BEC9' }}>{v.tagline}</div>
            </div>
            <div style={{ textAlign: 'right', color: '#6E7480', fontSize: 14 }}>preview →</div>
          </a>
        ))}
      </div>
    </main>
  );
}

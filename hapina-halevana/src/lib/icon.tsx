/**
 * Shared brand mark used by the `next/og` icon generators (favicon, apple-icon,
 * and the PWA manifest icons). Rendered to PNG at build/request time so we ship
 * real raster icons without checking binaries into the repo.
 */
export function IconMark({ maskable = false }: { maskable?: boolean }) {
  const pad = maskable ? "16%" : "10%";
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #141414 0%, #0d0d0d 60%, #1a1a1a 100%)",
        padding: pad,
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 48 48" fill="none">
        <path d="M12 38V14a3 3 0 0 1 3-3h21" stroke="#c89b3c" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M12 38h21" stroke="#c89b3c" strokeWidth="2.6" strokeLinecap="round" />
        <path
          d="M26 15c3.4 2 5 4.8 5 8.4 0 4.3-2.2 7.3-5 9.4-2.8-2.1-5-5.1-5-9.4 0-3.6 1.6-6.4 5-8.4Z"
          fill="#e59b3a"
        />
        <circle cx="26" cy="12.4" r="1.7" fill="#c89b3c" />
      </svg>
    </div>
  );
}

import { ImageResponse } from "next/og";
import { restaurant } from "@/content/restaurant";

export const alt = `${restaurant.name} — ${restaurant.legend}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background:
            "radial-gradient(1200px 600px at 30% 20%, rgba(229,155,58,0.28), transparent 60%), linear-gradient(135deg, #141414, #0d0d0d 70%)",
          color: "#fafafa",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="64" height="64" viewBox="0 0 48 48" fill="none">
            <path d="M12 38V14a3 3 0 0 1 3-3h21" stroke="#c89b3c" strokeWidth="2.6" strokeLinecap="round" />
            <path d="M12 38h21" stroke="#c89b3c" strokeWidth="2.6" strokeLinecap="round" />
            <path d="M26 15c3.4 2 5 4.8 5 8.4 0 4.3-2.2 7.3-5 9.4-2.8-2.1-5-5.1-5-9.4 0-3.6 1.6-6.4 5-8.4Z" fill="#e59b3a" />
          </svg>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 30, fontWeight: 600 }}>{restaurant.name}</span>
            <span style={{ fontSize: 16, letterSpacing: 6, color: "#c89b3c", textTransform: "uppercase" }}>
              The White Corner
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 22, letterSpacing: 8, color: "#c89b3c", textTransform: "uppercase" }}>
            Yehud · Est. {restaurant.founded}
          </span>
          <span style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, marginTop: 12 }}>
            The Legendary
          </span>
          <span style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, color: "#c89b3c" }}>
            Shawarma Experience
          </span>
        </div>

        <div style={{ display: "flex", gap: 40, fontSize: 22, color: "#a1998a" }}>
          <span>Rated {restaurant.proof.rating.toFixed(1)} · {restaurant.proof.reviewCount.toLocaleString()} reviews</span>
          <span>Kosher</span>
          <span>{restaurant.proof.yearsServing}+ years</span>
        </div>
      </div>
    ),
    size
  );
}

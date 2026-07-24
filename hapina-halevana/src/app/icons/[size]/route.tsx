import { ImageResponse } from "next/og";
import { IconMark } from "@/lib/icon";

/** Generates PWA manifest icons on demand: /icons/192, /icons/512, /icons/512?maskable=1 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ size: string }> }
) {
  const { size } = await params;
  const n = Math.min(1024, Math.max(48, parseInt(size, 10) || 512));
  const maskable = new URL(req.url).searchParams.has("maskable");
  return new ImageResponse(<IconMark maskable={maskable} />, { width: n, height: n });
}

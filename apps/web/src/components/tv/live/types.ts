// Channel / Programme types used across the Live TV components. In the
// real client these are generated from the proto schema; the shape kept
// here matches that schema exactly so swapping to the gRPC client is a
// one-import change.

export interface Programme {
  id: string;
  title: string;
  start: Date;
  stop: Date;
  description?: string;
  // Whether catch-up is available for this programme — drives whether the
  // "Restart from beginning" button is enabled.
  catchupAvailable?: boolean;
}

export interface Channel {
  id: string;
  number: number;
  name: string;
  logoUrl: string;
  category: string;
  streamUrl?: string;
  /**
   * Backup URLs for the player to try if the primary streamUrl
   * fails to load. Currently used for catch-up: Xtream panels
   * differ in how they spell timeshift, so the catchup builder
   * hands the player an ordered list of candidate URLs.
   */
  streamUrlAlts?: string[];
  now?: Programme;
  next1?: Programme;
  next2?: Programme;
  // Provider-side DVR / catch-up support, surfaced from the M3U.
  // The /tv/live player consults these when ?start= is in the URL.
  tvgId?: string;
  catchupKind?: string;
  catchupSource?: string;
  catchupDays?: number;
}

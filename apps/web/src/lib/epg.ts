// Minimal XMLTV parser. The format is verbose but predictable enough
// that a regex-based scan beats hauling in a full DOM parser (which
// also isn't available in edge runtime). We only extract what the
// channel banner needs: programme channel id, start, stop, title,
// description. Everything else (icons, ratings, credits, episode
// numbers, sub-titles) is intentionally skipped.
//
// XMLTV reference: http://wiki.xmltv.org/index.php/XMLTVFormat
//
// Date format from the spec:   YYYYMMDDHHmmss [+/-]HHMM
// Title element:                <title lang="en">…</title>
// Programme open tag example:   <programme channel="il.kan11"
//                                 start="20260526210000 +0300"
//                                 stop ="20260526220000 +0300">

export interface EpgProgramme {
  channelId: string;
  start: number; // epoch ms
  stop:  number;
  title: string;
  description?: string;
  /**
   * Opaque per-programme id some providers (Stalker, certain Flussonic
   * deployments) ship on `<programme catchup-id="...">`. When present
   * the catch-up URL builder substitutes it for `{catchup-id}` in the
   * channel's catchup-source template.
   */
  catchupId?: string;
}

const PROG_OPEN = /<programme\b([^>]*)>/g;
const TITLE_RE  = /<title[^>]*>([\s\S]*?)<\/title>/;
const DESC_RE   = /<desc[^>]*>([\s\S]*?)<\/desc>/;
const ATTR_RE   = /(\w[\w-]*)="([^"]*)"/g;
const CHAN_OPEN = /<channel\b([^>]*)>/g;
const DISPLAY_NAME_RE = /<display-name[^>]*>([\s\S]*?)<\/display-name>/g;

// XMLTV stamp -> ms. Example: "20260526210000 +0300"
function parseXmltvDate(s: string): number {
  if (!s) return NaN;
  // Pull the 14 digit head + optional offset; tolerate missing offset
  // (treated as UTC, which is what most aggregators emit).
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/.exec(s);
  if (!m) return NaN;
  const [, y, mo, d, h, mi, se, tz] = m;
  let offsetMin = 0;
  if (tz) {
    const sign = tz[0] === '-' ? -1 : 1;
    offsetMin = sign * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(3, 5)));
  }
  // Treat the components as UTC then subtract the source offset so
  // that, for example, "20260526210000 +0300" → 18:00 UTC.
  const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
  return asUtc - offsetMin * 60_000;
}

function decodeEntities(s: string): string {
  // The five XML predefined entities, plus numeric refs. Sufficient
  // for the title/desc text we surface in the UI.
  return s
    .replace(/&lt;/g,  '<')
    .replace(/&gt;/g,  '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

function unwrapCdata(s: string): string {
  const m = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(s);
  return m ? m[1] : s;
}

// Parse a single <programme>…</programme> element into our minimal shape.
function readProgramme(openAttrs: string, inner: string): EpgProgramme | null {
  let channelId = '', start = '', stop = '', catchupId = '';
  ATTR_RE.lastIndex = 0;
  let am: RegExpExecArray | null;
  while ((am = ATTR_RE.exec(openAttrs)) !== null) {
    const k = am[1].toLowerCase();
    const v = am[2];
    if      (k === 'channel')    channelId = v;
    else if (k === 'start')      start     = v;
    else if (k === 'stop')       stop      = v;
    else if (k === 'catchup-id') catchupId = v;
  }
  if (!channelId || !start) return null;

  const startMs = parseXmltvDate(start);
  const stopMs  = parseXmltvDate(stop);
  if (!isFinite(startMs)) return null;

  const titleM = TITLE_RE.exec(inner);
  const descM  = DESC_RE.exec(inner);
  const title  = titleM ? decodeEntities(unwrapCdata(titleM[1])).trim() : '';
  const desc   = descM  ? decodeEntities(unwrapCdata(descM[1])).trim() : undefined;
  if (!title) return null;

  return {
    channelId,
    start: startMs,
    stop:  isFinite(stopMs) ? stopMs : startMs + 30 * 60_000,
    title,
    description: desc,
    catchupId: catchupId || undefined,
  };
}

// Walk the XMLTV body once, emitting EpgProgramme objects. We do this
// linearly rather than building an intermediate DOM because EPG dumps
// for 12K channels can be 50–100 MB and a full DOM would crash mobile.
export function* iterProgrammes(xml: string): Generator<EpgProgramme> {
  PROG_OPEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PROG_OPEN.exec(xml)) !== null) {
    const openAttrs = m[1];
    const openEnd   = PROG_OPEN.lastIndex;
    const closeIdx  = xml.indexOf('</programme>', openEnd);
    if (closeIdx < 0) break;
    const inner = xml.slice(openEnd, closeIdx);
    const prog  = readProgramme(openAttrs, inner);
    if (prog) yield prog;
    PROG_OPEN.lastIndex = closeIdx + 12;
  }
}

// Group programmes per channel id, sorted by start time. The index
// keeps EVERY programme (past, present, future) so both Live (which
// picks now / next) and Catch-up (which picks the last N days) can
// reuse the same parse pass.
export function indexProgrammes(xml: string): Map<string, EpgProgramme[]> {
  const out: Map<string, EpgProgramme[]> = new Map();
  for (const prog of iterProgrammes(xml)) {
    const arr = out.get(prog.channelId);
    if (arr) arr.push(prog);
    else out.set(prog.channelId, [prog]);
  }
  for (const arr of out.values()) {
    arr.sort((a, b) => a.start - b.start);
  }
  return out;
}

// Normalise channel names for fuzzy matching: lowercase + drop every
// non-letter / non-digit character. This collapses "National Geographic
// HD", "national-geographic.hd", "National_Geographic_HD" → the same
// token so M3U names can find their XMLTV display-name counterparts
// regardless of punctuation.
export function normaliseChannelName(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

// Strip the trailing quality / country / language hints that often
// appear in M3U channel names but not in XMLTV display names (or
// vice-versa). "nationalgeographichd" → "nationalgeographic".
const QUALITY_TAIL = /(hd|fhd|uhd|sd|4k|hevc|h265|h264|hdr|dolby|atmos|ch\d+|backup|alt\d?|tr|en|us|uk|il|isr)+$/;
export function stripQualityTags(name: string): string {
  return name.replace(QUALITY_TAIL, '') || name;
}

// Walk every <channel id="..."><display-name>...</display-name></channel>
// block and yield one (id, displayNames[]) per channel. XMLTV files
// usually include a header section like this; aggregators like
// iptv-org always do. When a file ships without it the returned map
// is empty and we just rely on tvg-id matching.
export function* iterChannels(xml: string): Generator<{ id: string; displayNames: string[] }> {
  CHAN_OPEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CHAN_OPEN.exec(xml)) !== null) {
    const openAttrs = m[1];
    const openEnd   = CHAN_OPEN.lastIndex;
    const closeIdx  = xml.indexOf('</channel>', openEnd);
    if (closeIdx < 0) break;
    const inner = xml.slice(openEnd, closeIdx);
    let id = '';
    ATTR_RE.lastIndex = 0;
    let am: RegExpExecArray | null;
    while ((am = ATTR_RE.exec(openAttrs)) !== null) {
      if (am[1].toLowerCase() === 'id') { id = am[2]; break; }
    }
    if (!id) { CHAN_OPEN.lastIndex = closeIdx + 10; continue; }

    const names: string[] = [];
    DISPLAY_NAME_RE.lastIndex = 0;
    let dm: RegExpExecArray | null;
    while ((dm = DISPLAY_NAME_RE.exec(inner)) !== null) {
      const txt = decodeEntities(unwrapCdata(dm[1])).trim();
      if (txt) names.push(txt);
    }
    yield { id, displayNames: names };
    CHAN_OPEN.lastIndex = closeIdx + 10;
  }
}

// Build a normalised-display-name → channel-id map so M3U channels
// can find their EPG programmes when the tvg-id doesn't match but
// the human-visible name does. We also store the stripped-quality
// variant so "National Geographic HD" finds "National Geographic".
export function indexChannelNames(xml: string): Map<string, string> {
  const out: Map<string, string> = new Map();
  for (const ch of iterChannels(xml)) {
    for (const dn of ch.displayNames) {
      const norm = normaliseChannelName(dn);
      if (!norm) continue;
      if (!out.has(norm)) out.set(norm, ch.id);
      const stripped = stripQualityTags(norm);
      if (stripped !== norm && !out.has(stripped)) out.set(stripped, ch.id);
    }
  }
  return out;
}

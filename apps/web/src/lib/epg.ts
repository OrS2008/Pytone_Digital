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
}

const PROG_OPEN = /<programme\b([^>]*)>/g;
const TITLE_RE  = /<title[^>]*>([\s\S]*?)<\/title>/;
const DESC_RE   = /<desc[^>]*>([\s\S]*?)<\/desc>/;
const ATTR_RE   = /(\w[\w-]*)="([^"]*)"/g;

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
  let channelId = '', start = '', stop = '';
  ATTR_RE.lastIndex = 0;
  let am: RegExpExecArray | null;
  while ((am = ATTR_RE.exec(openAttrs)) !== null) {
    const k = am[1].toLowerCase();
    const v = am[2];
    if      (k === 'channel') channelId = v;
    else if (k === 'start')   start = v;
    else if (k === 'stop')    stop  = v;
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

// Group programmes per channel id, sorted by start time. We only keep
// programmes that haven't ended yet — the "current" + "next" + future
// slots are all we display in this UI.
export function indexProgrammes(xml: string): Map<string, EpgProgramme[]> {
  const now = Date.now();
  const out: Map<string, EpgProgramme[]> = new Map();
  for (const prog of iterProgrammes(xml)) {
    if (prog.stop < now) continue;
    const arr = out.get(prog.channelId);
    if (arr) arr.push(prog);
    else out.set(prog.channelId, [prog]);
  }
  for (const arr of out.values()) {
    arr.sort((a, b) => a.start - b.start);
  }
  return out;
}

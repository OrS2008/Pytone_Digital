// Mask credential / token segments in an M3U / Xtream / Flussonic URL
// so it can be rendered on screen without leaking the user's
// subscription password.
//
// Examples:
//   http://provider.tv/get.php?username=foo&password=bar&type=m3u
//     → provider.tv/get.php?username=***&password=***
//
//   http://host:1600/s/llftbjm2/channel-slug/video.m3u8
//     → host:1600/s/***/channel-slug/video.m3u8
//
// Uploaded files start with the literal "local:<id>" pseudo-URL; we
// render them with the file icon. Anything that isn't a parseable
// http(s) URL falls through unchanged on the assumption it's already
// non-sensitive (e.g. a description string).
export function maskSourceUrl(raw: string): string {
  if (!raw) return '';
  if (raw.startsWith('local:')) return '📁 Uploaded file';
  try {
    const u = new URL(raw);
    const params = u.searchParams;
    for (const key of ['username', 'password', 'pass', 'token', 'auth']) {
      if (params.has(key)) params.set(key, '***');
    }
    let path = u.pathname;
    // Flussonic signed prefix: /s/<TOKEN>/<stream>/...
    path = path.replace(/\/s\/[^/]+(?=\/)/, '/s/***');
    return `${u.host}${path}${params.toString() ? '?' + params.toString() : ''}`;
  } catch {
    return raw;
  }
}

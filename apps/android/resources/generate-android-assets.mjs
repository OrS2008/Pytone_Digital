// Generate Android launcher icons + splash bitmaps from the SVG sources
// under resources/. Run inside the GitHub Action after `npx cap add android`
// scaffolds the android/ directory. Writes to apps/android/android/app/src/main/res/.
//
// The mipmap sizes track the standard Android density buckets (mdpi=48,
// hdpi=72, xhdpi=96, xxhdpi=144, xxxhdpi=192). The splash centre image
// gets rasterised once large enough to survive scale-up on tablets.

import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const ROOT = process.argv[2];
if (!ROOT) {
  console.error('Usage: node generate-android-assets.mjs <android-app-src-main-dir>');
  process.exit(1);
}

const ICON_SVG  = await readFile(new URL('./icon.svg',  import.meta.url));
const SPLASH_SVG = await readFile(new URL('./splash.svg', import.meta.url));

const DENSITIES = [
  { name: 'mdpi',    size: 48  },
  { name: 'hdpi',    size: 72  },
  { name: 'xhdpi',   size: 96  },
  { name: 'xxhdpi',  size: 144 },
  { name: 'xxxhdpi', size: 192 },
];

async function writeFileEnsuringDir(path, buf) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buf);
}

// Launcher icons — square + round + foreground (for adaptive icons).
for (const { name, size } of DENSITIES) {
  const dir = join(ROOT, 'res', `mipmap-${name}`);

  const square = await sharp(ICON_SVG)
    .resize(size, size)
    .png()
    .toBuffer();
  await writeFileEnsuringDir(join(dir, 'ic_launcher.png'),       square);
  await writeFileEnsuringDir(join(dir, 'ic_launcher_round.png'), square);

  // Adaptive icon foreground: padded so the system mask doesn't crop
  // the play triangle. Foreground layer is 108dp logical; we render to
  // density * 1.5 to give the OS room.
  const fgSize = Math.round(size * 1.5);
  const padded = await sharp({
    create: {
      width: fgSize, height: fgSize, channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{
      input: await sharp(ICON_SVG)
        .resize(Math.round(fgSize * 0.62), Math.round(fgSize * 0.62))
        .png()
        .toBuffer(),
      gravity: 'center',
    }])
    .png()
    .toBuffer();
  await writeFileEnsuringDir(join(dir, 'ic_launcher_foreground.png'), padded);
}

// Splash bitmap — Capacitor's SplashScreen plugin looks for
// res/drawable/splash.png. We rasterise the SVG at a high resolution
// once; Android scales it with CENTER scaleType.
const splashPng = await sharp(SPLASH_SVG).resize(2732, 2732).png().toBuffer();
await writeFileEnsuringDir(join(ROOT, 'res', 'drawable', 'splash.png'), splashPng);
// drawable-port and drawable-land variants help on tablets — but using
// a single drawable centred on the solid bg colour works everywhere.

console.log('Android assets generated under', ROOT);

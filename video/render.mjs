// Render demo.html frame by frame and encode it with the Daria voice clips into morsy-demo.mp4.
// `node render.mjs --stills 2,10,15` writes those moments as PNGs to stills/ instead.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { once } from 'node:events';

const here = p => new URL(p, import.meta.url).pathname;
const stillsArg = process.argv.indexOf('--stills');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file://' + here('./demo.html'));
await page.evaluate(() => document.fonts.ready);
const { duration, fps, audio } = await page.evaluate(() => window.TIMELINE);
const frameAt = async t => {
  await page.evaluate(x => window.render(x), t);
  return page.screenshot({ type: 'png' });
};

if (stillsArg > 0) {
  mkdirSync(here('./stills'), { recursive: true });
  for (const t of process.argv[stillsArg + 1].split(',').map(Number)) {
    await page.evaluate(x => window.render(x), t);
    await page.screenshot({ path: here(`./stills/t${String(t).padStart(4, '0')}.png`) });
  }
} else {
  // Silence for the whole length, with each clip delayed to its cue and mixed on top.
  const inputs = audio.flatMap(a => ['-i', here('./' + a.file)]);
  const delays = audio.map((a, i) => `[${i + 2}:a]adelay=${Math.round(a.at * 1000)}:all=1[a${i}]`);
  const mix = `[1:a]${audio.map((_, i) => `[a${i}]`).join('')}amix=inputs=${audio.length + 1}:duration=first:normalize=0[aout]`;
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-f', 'lavfi', '-t', String(duration), '-i', 'anullsrc=r=48000:cl=stereo', ...inputs,
    '-filter_complex', [...delays, mix].join(';'), '-map', '0:v', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '192k', '-t', String(duration), here('./morsy-demo.mp4'),
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const total = Math.round(duration * fps);
  for (let i = 0; i < total; i++) {
    if (!ff.stdin.write(await frameAt(i / fps))) await once(ff.stdin, 'drain');
    if (i % (fps * 5) === 0) console.log(`frame ${i}/${total}`);
  }
  ff.stdin.end();
  const [code] = await once(ff, 'close');
  console.log(code === 0 ? 'wrote morsy-demo.mp4' : `ffmpeg exited with ${code}`);
}
await browser.close();

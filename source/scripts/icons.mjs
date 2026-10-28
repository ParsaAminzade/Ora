// Renders the extension icon (a gold sparkle on a dark rounded tile) to PNGs.
import { chromium } from 'playwright';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="30" fill="#0B0D14"/><rect x="1.5" y="1.5" width="125" height="125" rx="28.5" fill="none" stroke="#2A2C35" stroke-width="3"/><path d="M64 22c3.4 23.6 15.8 36 39.4 39.4C79.8 64.8 67.4 77.2 64 100.8 60.6 77.2 48.2 64.8 24.6 61.4 48.2 58 60.6 45.6 64 22z" fill="#D9B77E"/></svg>`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
for (const s of [16, 48, 128]) {
  await page.setViewportSize({ width: s, height: s });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body></html>`);
  await page.screenshot({ path: `public/icons/${s}.png`, omitBackground: true });
}
await browser.close();

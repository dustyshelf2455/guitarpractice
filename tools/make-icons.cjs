// Renders the PNG app icons from the SVG sources with headless Chromium.
// Usage: NODE_PATH=$(npm root -g) node tools/make-icons.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const rounded = fs.readFileSync(path.join(root, 'icons/icon.svg'), 'utf8');
const square = fs.readFileSync(path.join(__dirname, 'icon-square.svg'), 'utf8');

const jobs = [
  ['icons/icon-192.png', rounded, 192],
  ['icons/icon-512.png', rounded, 512],
  ['icons/maskable-512.png', square, 512],
  ['icons/apple-touch-icon.png', square, 180],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [out, svg, size] of jobs) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: path.join(root, out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log('wrote', out);
  }
  await browser.close();
})();

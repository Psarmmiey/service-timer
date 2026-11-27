// Regenerates every app and tray icon from the SVG sources in build/.
// Run with: npm run icons   (uses Electron to draw the SVGs, and iconutil on a Mac for .icns)
import { app, BrowserWindow, nativeImage } from "electron";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const read = (file) => readFileSync(join(root, file), "utf8");

/** PNG-based .ico with several sizes (Windows Vista and later). */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((png) => png.data)]);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  // Draw at 4x (at least 256 px) and scale down, so small sizes stay smooth.
  const render = async (svg, size) => {
    const drawn = Math.max(256, size * 4);
    win.setContentSize(drawn, drawn);
    const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${svg.replace("<svg ", `<svg width="${drawn}" height="${drawn}" `)}</body></html>`;
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: drawn, height: drawn });
    return nativeImage.createFromBuffer(image.resize({ width: size, height: size, quality: "best" }).toPNG()).toPNG();
  };

  const logo = read("build/icon.svg");
  const template = read("build/tray-template.svg");

  writeFileSync(join(root, "build/icon.png"), await render(logo, 1024));
  const icoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const icoPngs = [];
  for (const size of icoSizes) icoPngs.push({ size, data: await render(logo, size) });
  writeFileSync(join(root, "build/icon.ico"), ico(icoPngs));

  // Windows tray: the full-colour logo at tray sizes (100% to 250% scaling).
  writeFileSync(join(root, "resources/tray.ico"), ico(icoPngs.filter(({ size }) => size <= 48)));
  // Mac menu bar: a template image macOS tints for light and dark.
  writeFileSync(join(root, "resources/trayTemplate.png"), await render(template, 16));
  writeFileSync(join(root, "resources/trayTemplate@2x.png"), await render(template, 32));

  if (process.platform === "darwin") {
    const set = join(mkdtempSync(join(tmpdir(), "icon-")), "icon.iconset");
    execFileSync("mkdir", ["-p", set]);
    for (const size of [16, 32, 128, 256, 512]) {
      writeFileSync(join(set, `icon_${size}x${size}.png`), await render(logo, size));
      writeFileSync(join(set, `icon_${size}x${size}@2x.png`), await render(logo, size * 2));
    }
    execFileSync("iconutil", ["-c", "icns", set, "-o", join(root, "build/icon.icns")]);
    rmSync(set, { recursive: true, force: true });
  } else {
    console.log("Skipped build/icon.icns: run this on a Mac to update it.");
  }
  console.log("Icons written.");
  app.quit();
});

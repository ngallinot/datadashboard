import "server-only";
import fs from "node:fs";

/**
 * Renders an app URL to PDF with headless Chromium (playwright-core). Looks for a browser at CHROME_PATH,
 * PLAYWRIGHT_BROWSERS_PATH/chromium, or common install locations; returns null if none is available so the
 * caller can fall back to the print-styled HTML (which the browser's own Print dialog turns into the same PDF).
 */
function findChromium(): string | null {
  const candidates = [process.env.CHROME_PATH, process.env.PLAYWRIGHT_BROWSERS_PATH ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium` : undefined,
    "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"].filter((p): p is string => !!p);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

export async function renderPdf(url: string, cookies: { name: string; value: string }[]): Promise<Buffer | null> {
  const { chromium } = await import("playwright-core");
  let exe = findChromium();
  if (!exe) { try { const p = chromium.executablePath(); if (p && fs.existsSync(p)) exe = p; } catch { /* no playwright-managed browser */ } }   // `npx playwright install chromium`
  if (!exe) return null;
  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
  try {
    const ctx = await browser.newContext();
    const origin = new URL(url).origin;
    await ctx.addCookies(cookies.map((c) => ({ ...c, url: origin })));
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({ format: "Letter", printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: `<div style="width:100%;font-size:8px;color:#7c8792;padding:0 0.6in;display:flex;justify-content:space-between"><span>CSIU District Insights · Prototype with sample data</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>` });
    return Buffer.from(pdf);
  } finally { await browser.close(); }
}

// Renders static/img/social-card.png (1200×630), the Open Graph image of every page, with Playwright's Chromium.
// Run it after changing the logo or the tagline: `node scripts/render-social-card.mjs`. The PNG is committed.
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const logo = readFileSync(new URL('../static/img/logo.svg', import.meta.url), 'utf8');
const frame = readFileSync(new URL('../../media/d1-dashboard.gif', import.meta.url)).toString('base64');

const html = `<!doctype html><html><head><style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden}
  body{font-family:'Segoe UI',system-ui,-apple-system,Roboto,Arial,sans-serif;
    background:linear-gradient(135deg,#f0fdfa 0%,#ffffff 55%,#e2f5f2 100%);color:#0f172a}
  .wrap{box-sizing:border-box;width:1200px;height:630px;padding:64px 72px;display:grid;
    grid-template-columns:520px 1fr;gap:48px;align-items:center;border-bottom:12px solid #0f766e}
  .brand{display:flex;align-items:center;gap:20px}
  .brand svg{width:84px;height:84px}
  .brand span{font-size:52px;font-weight:700;letter-spacing:-1px}
  h1{font-size:40px;line-height:1.18;font-weight:650;letter-spacing:-0.5px;margin:40px 0 0}
  p{font-size:24px;color:#475569;margin:28px 0 0;font-family:Consolas,ui-monospace,monospace}
  .shot{border-radius:12px;overflow:hidden;box-shadow:0 24px 48px -20px rgba(15,23,42,.45);border:1px solid #cbd5e1}
  .shot img{display:block;width:100%}
</style></head><body><div class="wrap">
  <div>
    <div class="brand">${logo}<span>RepoHangar</span></div>
    <h1>Every Git repository in your workspace, on one dashboard.</h1>
    <p>repohangar.enbinario.com</p>
  </div>
  <div class="shot"><img src="data:image/gif;base64,${frame}" alt=""></div>
</div></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html);
  await page.waitForTimeout(300);
  await page.screenshot({ path: new URL('../static/img/social-card.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
  console.log('wrote static/img/social-card.png');
} finally {
  await browser.close();
}

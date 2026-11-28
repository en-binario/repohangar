import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const ROUTES = [
  '/',
  '/docs/',
  '/docs/getting-started/',
  '/docs/guide/dashboard/',
  '/docs/merge-requests/creating/',
  '/docs/merge-requests/profiles/',
  '/docs/reference/settings/',
  '/docs/reference/commands/',
  '/docs/privacy-and-security/',
  '/docs/legal/',
  '/docs/changelog/',
];

const manifest = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'));

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

for (const route of ROUTES) {
  test.describe(route, () => {
    test('loads without errors and links back to EnBinario and the repository', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto(route);
      await expect(page.locator('h1').first()).toBeVisible();
      await expect(page.locator('footer a[href="https://enbinario.com"]').first()).toBeAttached();
      await expect(page.locator('footer a[href="https://github.com/en-binario/repohangar"]')).toBeAttached();
      expect(errors).toEqual([]);
    });

    for (const scheme of ['light', 'dark'] as const) {
      test(`has no axe violations (${scheme})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(route);
        await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
      });
    }

    test('has no horizontal page scroll', async ({ page }) => {
      await page.goto(route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}

test('the settings reference lists every setting of the manifest', async ({ page }) => {
  await page.goto('/docs/reference/settings/');
  const ids = Object.keys(manifest.contributes.configuration.properties);
  for (const id of ids) {
    const anchor = id.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await expect(page.locator(`h3#${anchor}`)).toContainText(id);
  }
});

test('the commands reference lists every command of the manifest', async ({ page }) => {
  await page.goto('/docs/reference/commands/');
  for (const c of manifest.contributes.commands) {
    await expect(page.locator('td code', { hasText: new RegExp(`^${c.command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) })).toBeAttached();
  }
});

test('the home page shows the demos with their alternative text', async ({ page }) => {
  await page.goto('/');
  const images = page.locator('main img, header img');
  await expect(images).toHaveCount(6);
  for (const alt of await images.evaluateAll((els) => els.map((e) => e.getAttribute('alt')))) {
    expect(alt?.length ?? 0).toBeGreaterThan(20);
  }
});

test('metadata points at the custom domain', async ({ page }) => {
  await page.goto('/docs/getting-started/');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://repohangar.enbinario.com/docs/getting-started/',
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    'https://repohangar.enbinario.com/img/social-card.png',
  );
});

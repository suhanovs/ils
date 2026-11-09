import { test, expect } from '@playwright/test';
test('explores the actual Ian track and switches cumulative swaths', async ({page}) => {
  await page.goto('/v2/');
  await expect(page.getByRole('heading', {name:'Hurricane Ian'})).toBeVisible();
  await expect(page.getByText('Cumulative wind swath')).toBeVisible();
  await expect(page.locator('.leaflet-interactive').first()).toBeVisible();
  const before = await page.locator('#point-time').textContent();
  await page.getByRole('slider', {name:'Track point'}).fill('10');
  await expect(page.locator('#point-time')).not.toHaveText(before);
  await page.getByRole('button', {name:'50 kt'}).click();
  await expect(page.getByRole('button', {name:'50 kt'})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button', {name:'Hide track'}).click();
  await expect(page.getByRole('button', {name:'Show track'})).toBeVisible();
});

test('mobile layout exposes map and working controls without horizontal overflow', async ({page}) => {
  await page.setViewportSize({width:375,height:812});
  await page.goto('/v2/');
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.getByRole('button', {name:'64 kt'})).toBeVisible();
  await page.getByRole('button', {name:'64 kt'}).click();
  await expect(page.getByRole('button', {name:'64 kt'})).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.getByRole('button', {name:'Play track'}).click();
  await expect(page.getByRole('button', {name:'Pause track'})).toBeVisible();
  await page.getByRole('button', {name:'Pause track'}).click();
  await expect(page.getByRole('button', {name:'Play track'})).toBeVisible();
});

test('basemap uses OpenStreetMap tiles, not a provider API-key placeholder', async ({page}) => {
  await page.goto('/v2/');
  await expect(page.locator('.leaflet-tile').first()).toHaveAttribute('src', /tile\.openstreetmap\.org/);
});

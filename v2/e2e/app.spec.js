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

for (const viewport of [{width:1280,height:800},{width:375,height:812}]) {
 test(`housing overlay searchable selection at ${viewport.width}px`, async ({page})=>{
  await page.setViewportSize(viewport); await page.goto('/v2/');
  await page.getByRole('button',{name:'Show housing tracts'}).click();
  await expect(page.getByRole('button',{name:'Hide housing tracts'})).toBeVisible();
  const search=page.getByRole('searchbox',{name:'Search Florida tract GEOID'});
  await search.fill('12001000201');
  await page.getByRole('button',{name:'Select tract 12001000201'}).click();
  await expect(page.getByText('2,499', {exact:true})).toBeVisible();
  await expect(page.getByText('± 320', {exact:true})).toBeVisible();
  await expect(page.getByText('Census estimate', {exact:false}).first()).toBeVisible();
  await expect(page.locator('#map')).toBeInViewport();
  if (viewport.width === 375) {
   const onTop = await page.locator('#map').evaluate(el=>{const r=el.getBoundingClientRect(); const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return el.contains(hit)});
   expect(onTop).toBe(true);
  }
  await page.getByRole('button',{name:'Hide housing tracts'}).click();
  await expect(page.getByRole('button',{name:'Show housing tracts'})).toBeVisible();
 });
}

test('explains the map in plain language without legalistic warnings', async ({page}) => {
  await page.goto('/v2/');
  await expect(page.getByRole('heading',{name:'Where homes are'})).toBeVisible();
  await expect(page.getByText('Estimated wind extent over the full storm.')).toBeVisible();
  await expect(page.getByText('Read this map carefully')).toHaveCount(0);
  await expect(page.getByText('Sources & assumptions')).toBeVisible();
});

for (const width of [1280,375]) {
 test(`fictional market explorer at ${width}px`, async ({page})=>{
  await page.setViewportSize({width,height:800}); await page.goto('/v2/');
  await page.getByRole('button',{name:'Show housing tracts'}).click();
  await expect(page.getByRole('heading',{name:'Fictional cedent market'})).toBeVisible();
  const canvas = page.locator('.leaflet-overlay-pane canvas').first();
  const initial = await canvas.evaluate(el=>el.toDataURL());
  await page.getByRole('checkbox',{name:/Cedent A/}).check();
  await page.getByRole('checkbox',{name:/Cedent B/}).check();
  await expect(page.locator('#market-summary')).toContainText('2 selected');
  await expect(page.locator('#market-summary')).toContainText('overlap');
  await expect(page.locator('#market-summary')).toContainText('housing-unit equivalents');
  await expect.poll(()=>canvas.evaluate(el=>el.toDataURL())).not.toBe(initial);
  const concentration=await canvas.evaluate(el=>el.toDataURL());
  await page.getByLabel('Map view').selectOption('overlap');
  await expect.poll(()=>canvas.evaluate(el=>el.toDataURL())).not.toBe(concentration);
  const before=await page.locator('#market-summary').textContent();
  await page.getByLabel('Market seed').fill('43');
  await page.getByRole('button',{name:'Generate market'}).click();
  await expect(page.locator('#market-summary')).not.toHaveText(before);
  await page.getByRole('button',{name:'50 kt'}).click();
  await expect(page.getByRole('button',{name:'50 kt'})).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 });
}

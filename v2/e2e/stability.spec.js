import { test, expect } from '@playwright/test';

for (const width of [1280, 375]) {
 test(`recalculation retains results layout immediately at ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:800});
  await page.goto('/v2/');
  await page.getByRole('checkbox',{name:/Cedent 01/}).check();
  await expect(page.locator('#xol-results')).toContainText('Investor loss',{timeout:30000});
  const input=page.getByLabel('Upfront capital ($)');
  await input.scrollIntoViewIfNeeded();
  const before=await page.locator('#xol-results').evaluate(el=>el.getBoundingClientRect().height);
  await input.fill('2000000');
  const immediate=await page.locator('#xol-results').evaluate(el=>el.getBoundingClientRect().height);
  expect(Math.abs(immediate-before)).toBeLessThanOrEqual(3);
  await expect(page.locator('#xol-results')).toContainText('$2,000,000');
 });
}

test('thematic sections remain expanded and keyboard collapsible', async ({page})=>{
 await page.goto('/v2/');
 for(const name of ['Hazard','Exposure','Cedents','Underwriting']) {
  const section=page.locator('details.control-section').filter({has:page.getByText(name,{exact:true})});
  await expect(section).toHaveAttribute('open','');
  const summary=section.locator(':scope > summary');
  await summary.focus(); await page.keyboard.press('Enter');
  await expect(section).not.toHaveAttribute('open','');
  await page.keyboard.press('Enter'); await expect(section).toHaveAttribute('open','');
 }
});

test('regenerating preserves cedent node, nested scroll and focus', async ({page})=>{
 await page.goto('/v2/');
 await expect(page.locator('#cedent-list input')).not.toHaveCount(0);
 await page.locator('#cedent-list').evaluate(el=>el.scrollTop=75);
 await page.locator('#cedent-list input').first().evaluate(el=>window.originalCedent=el);
 const before=await page.locator('#cedent-list').evaluate(el=>el.scrollTop);
 await page.getByLabel('Seed',{exact:true}).fill('43');
 await page.getByRole('button',{name:'Generate'}).click();
 expect(await page.evaluate(()=>window.originalCedent===document.querySelector('#cedent-list input'))).toBe(true);
 expect(await page.locator('#cedent-list').evaluate(el=>el.scrollTop)).toBe(before);
});

test('expanded cedent details survive recalculation', async ({page})=>{
 await page.goto('/v2/');
 await page.getByRole('checkbox',{name:/Cedent 01/}).check();
 const details=page.locator('#xol-results details').first();
 await expect(details).toBeVisible({timeout:30000});
 await details.locator('summary').click();
 await page.getByLabel('Upfront capital ($)').fill('2000000');
 await expect(page.locator('#xol-status')).toHaveText('');
 await expect(details).toHaveAttribute('open','');
});

for(const width of [1280,375]) {
 test(`selection and market controls keep scroll and position at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:800});await page.goto('/v2/');
  await expect(page.locator('#cedent-list input')).not.toHaveCount(0);
  const box=page.getByRole('checkbox',{name:/Cedent 01/});
  await box.scrollIntoViewIfNeeded();
  const sample=()=>page.evaluate(()=>({panel:document.querySelector('.panel').scrollTop,page:window.scrollY,top:document.querySelector('#cedent-list').getBoundingClientRect().top}));
  for(let i=0;i<3;i++){
   const before=await sample();await box.click();const immediate=await sample();
   await page.waitForTimeout(700);const after=await sample();
   for(const state of [immediate,after]) for(const key of ['panel','page','top']) expect(Math.abs(state[key]-before[key]),`${key} ${JSON.stringify({before,state})}`).toBeLessThanOrEqual(3);
  }
  const view=page.getByLabel('View',{exact:true});await view.scrollIntoViewIfNeeded();
  const before=await sample();await view.selectOption('overlap');const after=await sample();
  for(const key of ['panel','page','top']) expect(Math.abs(after[key]-before[key])).toBeLessThanOrEqual(3);
 });
}

test('mobile sticky map never obscures an underwriting control when scrolled into view',async({page})=>{
 await page.setViewportSize({width:375,height:800});await page.goto('/v2/');
 await page.getByRole('checkbox',{name:/Cedent 01/}).check();await expect(page.locator('#xol-results')).toContainText('Investor loss',{timeout:30000}); const field=page.getByLabel('Upfront capital ($)'); await field.fill('2000000');await expect(page.locator('#xol-status')).toHaveText('');await page.getByLabel('Attachment (% of exposure)').scrollIntoViewIfNeeded();
 const hit=await field.evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el});
 expect(hit).toBe(true);
});

test('mobile controls do not depend on asynchronously loaded remote fonts', async ({page})=>{
 const fontRequests=[];
 await page.route(/fonts\.(googleapis|gstatic)\.com/, route=>{fontRequests.push(route.request().url());return route.abort()});
 await page.setViewportSize({width:375,height:800});
 await page.goto('/v2/');
 await expect(page.locator('#cedent-list input')).not.toHaveCount(0);
 expect(fontRequests).toEqual([]);
});

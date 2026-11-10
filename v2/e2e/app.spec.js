import { test, expect } from '@playwright/test';
test('market and XOL work without housing and preserve footprint when toggled', async ({page}) => {
 await page.goto('/v2/');
 const housing=page.getByRole('checkbox',{name:'Housing tracts'});
 await expect(housing).not.toBeChecked();
 await page.getByRole('checkbox',{name:/Cedent 01/}).check({timeout:30000});
 await expect(page.locator('#xol-results')).toContainText('Investor loss',{timeout:30000});
 const before=await page.locator('#xol-results').innerText();
 await expect(page.locator('canvas.market-footprint')).toHaveCount(1);
 await housing.check(); await housing.uncheck();
 await expect(page.getByRole('checkbox',{name:/Cedent 01/})).toBeChecked();
 await expect(page.locator('canvas.market-footprint')).toHaveCount(1);
 await expect(page.locator('#xol-results')).toHaveText(before,{useInnerText:true});
 await page.getByRole('checkbox',{name:/Cedent 01/}).uncheck();
 await expect(page.locator('canvas.market-footprint')).toHaveCount(0);
});
test('failed automatic tract load can be retried without enabling housing', async ({page}) => {
 let attempts=0;
 await page.route('**/fl-tracts.bin',route=>++attempts===1?route.abort():route.continue());
 await page.goto('/v2/');
 await expect(page.getByRole('button',{name:'Retry loading data'})).toBeVisible();
 await expect(page.locator('#cedent-list input')).toHaveCount(0);
 await page.getByRole('button',{name:'Retry loading data'}).click();
 await page.getByRole('checkbox',{name:/Cedent 01/}).check();
 await expect(page.locator('#xol-results')).toContainText('Investor loss',{timeout:30000});
 await expect(page.getByRole('checkbox',{name:'Housing tracts'})).not.toBeChecked();
 expect(attempts).toBe(2);
});
test('explores the actual Ian track and static cumulative swaths', async ({page}) => {
  await page.goto('/v2/');
  await expect(page.getByRole('heading', {name:'Hurricane Ian'})).toBeVisible();
  await expect(page.getByText('Cumulative wind swath')).toBeVisible();
  await expect(page.locator('.leaflet-interactive').first()).toBeVisible();
  const before = await page.locator('#point-time').textContent();
  await page.getByRole('slider', {name:'Track point'}).fill('10');
  await expect(page.locator('#point-time')).not.toHaveText(before);
  await page.getByRole('button', {name:'Hide track'}).click();
  await expect(page.getByRole('button', {name:'Show track'})).toBeVisible();
});

test('mobile layout exposes map and working controls without horizontal overflow', async ({page}) => {
  await page.setViewportSize({width:375,height:812});
  await page.goto('/v2/');
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('[data-swath="64"]')).toBeVisible();
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
  await page.getByRole('checkbox',{name:'Housing tracts'}).check();
  await expect(page.getByRole('checkbox',{name:'Housing tracts'})).toBeChecked();
  await page.getByText('Find a tract').click();
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
  await page.getByRole('checkbox',{name:'Housing tracts'}).uncheck();
  await expect(page.getByRole('checkbox',{name:'Housing tracts'})).not.toBeChecked();
 });
}

test('explains the map in plain language without legalistic warnings', async ({page}) => {
  await page.goto('/v2/');
  await expect(page.getByRole('heading',{name:'Where homes are'})).toBeVisible();
  await expect(page.getByText(/Static estimated wind extent/)).toBeVisible();
  await expect(page.getByText('Read this map carefully')).toHaveCount(0);
  await expect(page.getByText('Sources & assumptions')).toBeVisible();
});

for (const width of [1280,375]) {
 test(`fictional market explorer at ${width}px`, async ({page})=>{
  await page.setViewportSize({width,height:800}); await page.goto('/v2/');
  await page.getByRole('checkbox',{name:'Housing tracts'}).check();
  await expect(page.getByRole('heading',{name:'Fictional cedent market'})).toBeVisible();
  await page.getByRole('checkbox',{name:/Cedent 01/}).check();
  const canvas = page.locator('canvas.market-footprint');
  await expect(canvas).toBeVisible();
  const initial = await canvas.evaluate(el=>el.toDataURL());
  await page.getByRole('checkbox',{name:/Cedent 02/}).check();
  await expect(page.locator('#market-summary')).toContainText('2 selected');
  await expect(page.locator('#market-summary')).toContainText('of selection');
  await expect(page.locator('#market-summary')).toContainText('statewide market');
  await expect(page.locator('#market-residual')).toContainText('Other insurers');
  await expect(page.locator('#market-summary')).toContainText('county');
  await expect(page.locator('#market-summary')).not.toContainText('housing-unit equivalents');
  await expect.poll(()=>canvas.evaluate(el=>el.toDataURL())).not.toBe(initial);
  const concentration=await canvas.evaluate(el=>el.toDataURL());
  await page.getByLabel('View', {exact:true}).selectOption('overlap');
  await expect.poll(()=>canvas.evaluate(el=>el.toDataURL())).not.toBe(concentration);
  const before=await page.locator('#market-summary').textContent();
  await page.getByLabel('Seed', {exact:true}).fill('43');
  await page.getByRole('button',{name:'Generate'}).click();
  await expect(page.locator('#market-summary')).not.toHaveText(before);
  await expect(page.locator('[data-swath="50"]')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 });
}

test('shows all cumulative wind extents together', async ({page}) => {
 await page.goto('/v2/');
 await expect(page.locator('[data-swath]')).toHaveCount(3);
 for (const wind of ['34','50','64']) await expect(page.locator(`[data-swath="${wind}"]`)).toBeVisible();
 await expect(page.getByText(/static.*full storm/i)).toBeVisible();
 await expect(page.locator('[data-wind]')).toHaveCount(0);
});
test('scrubbing interpolates the track without changing static swaths', async ({page}) => {
 await page.goto('/v2/');
 const slider=page.getByRole('slider',{name:'Track point'});
 await expect(slider).toHaveAttribute('step','0.001');
 await expect(page.locator('path.swath-layer')).toHaveCount(6);
 const paths=await page.locator('path.swath-layer').evaluateAll(els=>els.map(el=>el.getAttribute('d')));
 await slider.fill('10.5');
 await expect(page.locator('#point-count')).toContainText('Interpolated');
 await expect(page.locator('.storm-symbol')).toBeVisible();
 expect(await page.locator('path.swath-layer').evaluateAll(els=>els.map(el=>el.getAttribute('d')))).toEqual(paths);
});
test('housing is a compact visualization option with delayed accessible help', async ({page}) => {
 await page.goto('/v2/');
 await expect(page.getByRole('checkbox',{name:'Housing tracts'})).toBeVisible();
 await expect(page.getByRole('group',{name:'Visualization options'})).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);
 const help=page.getByRole('button',{name:'About modeled cedents'});
 await help.hover();
 await expect(page.getByRole('tooltip')).toBeHidden();
 await expect(page.getByRole('tooltip')).toBeVisible({timeout:4000});
 await help.focus();
});
test('mobile timeline sits before the long explorer panel', async ({page})=>{
 await page.setViewportSize({width:375,height:812}); await page.goto('/v2/');
 const positions=await page.evaluate(()=>({timeline:document.querySelector('.timeline').getBoundingClientRect().top,panel:document.querySelector('.panel').getBoundingClientRect().top}));
 expect(positions.timeline).toBeLessThan(positions.panel);
});
test('playback moves continuously and interpolates real observation time and intensity', async ({page})=>{
 await page.goto('/v2/');
 const slider=page.getByRole('slider',{name:'Track point'});
 await slider.fill('13.5');
 await expect(page.locator('#point-time')).toContainText('03:00');
 await expect(page.locator('#point-time')).toContainText('57.5 kt');
 await page.getByRole('button',{name:'Play track'}).click();
 await expect.poll(async()=>Number(await slider.inputValue())).toBeGreaterThan(13.5);
 await page.getByRole('button',{name:'Pause track'}).click();
 const paused=await slider.inputValue();
 await page.waitForTimeout(150);
 expect(await slider.inputValue()).toBe(paused);
});

test('Ian XOL scenario selects and clears cedents', async ({page})=>{
 await page.goto('/v2/');
 await page.getByRole('checkbox',{name:'Housing tracts'}).check();
 await expect(page.locator('#xol-results')).toContainText('Select cedents');
 await page.getByRole('checkbox',{name:/Cedent 01/}).check();
 await expect(page.locator('#xol-results')).toContainText('Investor loss', {timeout:30000});
 await expect(page.locator('#xol-results')).toContainText('Cedent 01');
 await expect(page.locator('.xol-waterfall').first()).toBeVisible();
 await page.getByRole('checkbox',{name:/Cedent 01/}).uncheck();
 await expect(page.locator('#xol-results')).toContainText('Select cedents');
});

test('storm marker is a rotating hurricane vector and timeline is compact', async ({page})=>{
 await page.goto('/v2/');
 await expect(page.locator('.storm-symbol svg')).toBeVisible();
 expect(await page.locator('.timeline').evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(110);
 await page.getByRole('slider',{name:'Track point'}).fill('10.5');
 await expect(page.locator('.storm-symbol svg')).toBeVisible();
});

test('XOL results reconcile with the shared Ian engine and stay static while scrubbing', async ({page})=>{
 await page.goto('/v2/');
 await page.getByRole('checkbox',{name:'Housing tracts'}).check();
 await page.getByRole('checkbox',{name:/Cedent 01/}).check();
 await page.getByRole('checkbox',{name:/Cedent 02/}).check();
 await expect(page.locator('#xol-results')).toContainText('Cedent 02',{timeout:30000});
 const expected=await page.evaluate(async()=>{
  const {generateMarket}=await import('/v2/src/market.js');
  const {simulatePortfolio}=await import('/v2/src/loss.js');
  const r=await fetch('/v2/data/fl-tracts.bin');
  const features=(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json()).features;
  const market=generateMarket(features,42);
  const result=simulatePortfolio({features,market,event:window.stormSwath,capital:1000000,positions:[0,1].map(index=>({index,weight:1,attachmentFraction:.02,limitFraction:.08,rateOnLine:.1}))});
  return {premium:result.premium,loss:result.investorLoss,net:result.netReturn,positions:result.positions};
 });
 const format=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
 const portfolio=page.locator('#xol-results > .xol-card').first();
 for(const [label,value] of [['Premium',expected.premium],['Investor loss',expected.loss],['Net',expected.net]]) await expect(portfolio.locator('dl div').filter({has:page.getByText(label,{exact:true})})).toContainText(format(value));
 const before=await page.locator('#xol-results').innerText();
 const panes=await page.evaluate(()=>({footprint:Number(getComputedStyle(document.querySelector('.leaflet-footprint-pane')).zIndex),storm:Number(getComputedStyle(document.querySelector('.leaflet-overlay-pane')).zIndex)}));
 expect(panes.footprint).toBeGreaterThan(panes.storm);
 for(const wind of [34,50,64]) await expect(page.locator(`path.swath-${wind}:visible`).first()).toBeVisible();
 await page.getByRole('slider',{name:'Track point'}).fill('10.5');
 await expect(page.locator('#xol-results')).toHaveText(before,{useInnerText:true});
 await page.getByRole('checkbox',{name:'Housing tracts'}).uncheck();
 await expect(page.locator('#xol-results')).toHaveText(before,{useInnerText:true});
 await page.getByLabel('Upfront capital ($)').fill('0');
 await expect(portfolio.locator('dl div').filter({has:page.getByText('Investor capital',{exact:true})})).toContainText('$0');
 await expect(portfolio.locator('dl div').filter({has:page.getByText('Premium',{exact:true})})).toContainText('$0');
 await page.getByLabel('Limit (% of exposure)').fill('0');
 await expect(portfolio.locator('dl div').filter({has:page.getByText('Layer limit',{exact:true})})).toContainText('$0');
 await page.getByLabel('Upfront capital ($)').fill('1000000');
 await expect(page.locator('#xol-results')).toContainText('Unallocated capital: $1,000,000');
 await page.getByLabel('Attachment (% of exposure)').fill('101');
 await expect(page.locator('#xol-results')).toContainText('cannot exceed 100%');
});

test('regenerating a selected market uses the new seed for XOL', async ({page})=>{
 await page.goto('/v2/');
 await page.getByRole('checkbox',{name:/Cedent 01/}).check();
 await expect(page.locator('#xol-results')).toContainText('Investor loss',{timeout:30000});
 await page.getByLabel('Seed',{exact:true}).fill('43');
 await page.getByRole('button',{name:'Generate'}).click();
 await expect(page.locator('#market-residual')).toContainText('Seed 43');
 const expected=await page.evaluate(async()=>{
  const {generateMarket}=await import('/v2/src/market.js');
  const {simulatePortfolio}=await import('/v2/src/loss.js');
  const r=await fetch('/v2/data/fl-tracts.bin');
  const features=(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json()).features;
  return simulatePortfolio({features,market:generateMarket(features,43),event:window.stormSwath,capital:1000000,positions:[{index:0,weight:1,attachmentFraction:.02,limitFraction:.08,rateOnLine:.1}]});
 });
 const format=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
 const portfolio=page.locator('#xol-results > .xol-card').first();
 for(const [label,value] of [['Exposure',expected.positions[0].exposure],['Investor loss',expected.investorLoss],['Net',expected.netReturn]]) await expect(portfolio.locator('dl div').filter({has:page.getByText(label,{exact:true})})).toContainText(format(value),{timeout:30000});
 await expect(page.getByRole('checkbox',{name:'Housing tracts'})).not.toBeChecked();
});

test('failed swath is not treated as a no-storm scenario', async ({page})=>{
 await page.route('**/ian-windswath.geojson', route=>route.abort());
 await page.goto('/v2/');
 await page.getByRole('checkbox',{name:'Housing tracts'}).check();
 await page.getByRole('checkbox',{name:/Cedent 01/}).check();
 await expect(page.locator('#xol-results')).toContainText('Storm data unavailable');
 await expect(page.locator('#xol-results')).not.toContainText('Premium');
});

test('footprint repaints real pixels after clearing and reselecting', async ({page})=>{
 await page.goto('/v2/');
 const cedent=page.getByRole('checkbox',{name:/Cedent 01/});
 await cedent.check({timeout:30000});
 const pixels=()=>page.locator('canvas.market-footprint').evaluate(async canvas=>{
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  return canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((v,i)=>i%4===3 && v>0);
 });
 await expect.poll(pixels).toBe(true);
 await cedent.uncheck();
 await cedent.check();
 await expect.poll(pixels).toBe(true);
});

test('event impact displays the shared modeled loss and remains static on scrub', async ({page})=>{
 await page.goto('/v2/');
 await page.getByRole('checkbox',{name:/Cedent 01/}).check({timeout:30000});
 await page.getByRole('checkbox',{name:/Cedent 02/}).check();
 await page.getByLabel('View',{exact:true}).selectOption('impact');
 await expect(page.locator('#xol-results')).toContainText('Cedent 02',{timeout:30000});
 await expect(page.locator('#market-legend')).toContainText('Outside swath');
 const expected=await page.evaluate(async()=>{
  const {generateMarket}=await import('/v2/src/market.js');
  const {simulatePortfolio}=await import('/v2/src/loss.js');
  const r=await fetch('/v2/data/fl-tracts.bin');
  const features=(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json()).features;
  const market=generateMarket(features,42);
  const scenario=simulatePortfolio({features,market,event:window.stormSwath,capital:0,positions:[0,1].map(index=>({index,weight:1,attachmentFraction:0,limitFraction:0,rateOnLine:0}))});
  const loss=scenario.tracts.reduce((s,t,i)=>s+(market.tracts[i].allocations[0]+market.tracts[i].allocations[1])*300000*t.damageFactor,0);
  return {loss, thresholds:[...new Set(scenario.tracts.filter((t,i)=>market.tracts[i].allocations[0]+market.tracts[i].allocations[1]>0).map(t=>t.threshold))]};
 });
 expect(expected.loss).toBeGreaterThan(0);
 expect(expected.thresholds.length).toBeGreaterThan(1);
 const amount=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(expected.loss);
 await expect(page.locator('#market-legend')).toContainText(amount);
 await expect(page.locator('#xol-results > .xol-card').first().locator('dl div').filter({has:page.getByText('Cedent event loss',{exact:true})})).toContainText(amount);
 const before=await page.locator('canvas.market-footprint').evaluate(async c=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return c.toDataURL()});
 await page.getByRole('slider',{name:'Track point'}).fill('10.5');
 expect(await page.locator('canvas.market-footprint').evaluate(c=>c.toDataURL())).toBe(before);
});

test('overlap legend explains that two cedents are needed', async ({page})=>{
 await page.goto('/v2/');
 await page.getByRole('checkbox',{name:/Cedent 01/}).check({timeout:30000});
 await page.getByLabel('View',{exact:true}).selectOption('overlap');
 await expect(page.locator('#market-legend')).toContainText('Select at least two');
 await page.getByRole('checkbox',{name:/Cedent 02/}).check();
 await expect(page.locator('#market-legend')).toContainText('Multiple cedents');
});

test('impact reports classification failure instead of zero or perpetual loading', async ({page})=>{
 await page.route('**/ian-windswath.geojson',route=>route.fulfill({json:{type:'FeatureCollection',features:[{type:'Feature',properties:{RADII:34},geometry:{type:'Point',coordinates:[-81,26]}}]}}));
 await page.goto('/v2/');
 await page.getByRole('checkbox',{name:/Cedent 01/}).check({timeout:30000});
 await page.getByLabel('View',{exact:true}).selectOption('impact');
 await expect(page.locator('#market-legend')).toContainText('unavailable',{timeout:30000});
 await expect(page.locator('#xol-results')).toContainText('Could not calculate');
});

test('impact refreshes on seed and selection even when XOL terms are invalid', async ({page})=>{
 await page.goto('/v2/');
 await page.getByRole('checkbox',{name:/Cedent 01/}).check({timeout:30000});
 await page.getByLabel('View',{exact:true}).selectOption('impact');
 await expect(page.locator('#market-legend')).toContainText('Modeled cedent loss',{timeout:30000});
 const before=await page.locator('#market-legend').innerText();
 await page.getByLabel('Attachment (% of exposure)').fill('101');
 await expect(page.locator('#xol-results')).toContainText('cannot exceed 100%');
 await page.getByLabel('Seed',{exact:true}).fill('43');
 await page.getByRole('button',{name:'Generate'}).click();
 await expect(page.locator('#market-legend')).toContainText('Modeled cedent loss',{timeout:30000});
 await expect(page.locator('#market-legend')).not.toHaveText(before,{useInnerText:true});
 await expect(page.locator('#xol-results')).toContainText('cannot exceed 100%');
 const seed43=await page.locator('#market-legend').innerText();
 await page.getByRole('checkbox',{name:/Cedent 02/}).check();
 await expect(page.locator('#market-legend')).not.toHaveText(seed43,{useInnerText:true});
});

test('selected exposures show event impact by default', async ({page}) => {
 await page.goto('/v2/');
 await expect(page.locator('#market-view')).toHaveValue('impact');
 await page.getByRole('checkbox',{name:/Cedent 01/}).check();
 await expect(page.locator('#market-legend')).toContainText('Modeled cedent loss');
});

import { test, expect } from '@playwright/test';
test('hazard controls are concise without repeating the active event', async ({page}) => {
 await page.goto('/v2/');
 await expect(page.getByRole('heading',{name:'Historical events'})).toBeVisible();
 await expect(page.getByLabel('Find an event')).toBeVisible();
 await expect(page.locator('#selected-storms')).toContainText('IAN (2022)');
 await expect(page.locator('#active-storm')).toBeEmpty();
 await expect(page.getByText('Lifetime wind footprint')).toHaveCount(0);
 const text=await page.locator('.panel').innerText();
 expect((text.match(/\bstorms?\b/gi)||[]).length).toBeLessThanOrEqual(1);
});
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
  await expect(page.getByRole('heading', {name:'Historical events'})).toBeVisible();
  await expect(page.getByText('Lifetime wind footprint')).toHaveCount(0);
  await expect(page.locator('.archive-track').first()).toBeVisible();
  const before = await page.locator('#point-time').textContent();
  await page.getByRole('slider', {name:'Track point'}).fill('10');
  await expect(page.locator('#point-time')).not.toHaveText(before);
  await expect(page.getByRole('button', {name:'Hide track'})).toHaveCount(0);
});

test('mobile layout exposes map and working controls without horizontal overflow', async ({page}) => {
  await page.setViewportSize({width:375,height:812});
  await page.goto('/v2/');
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.getByText(/Hover or tap/)).toBeVisible();
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
  if (viewport.width === 375) await page.locator('#map').scrollIntoViewIfNeeded();
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
  await expect(page.getByText(/Hover or tap/)).toBeVisible();
  await expect(page.getByText('Read this map carefully')).toHaveCount(0);
  await expect(page.getByText('Sources & assumptions')).toHaveCount(0);
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
  await expect(page.locator('path.swath-50').first()).toBeAttached();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 });
}

test('shows all cumulative wind extents together', async ({page}) => {
 await page.goto('/v2/');
 for (const wind of ['34','50','64']) await expect(page.locator(`path.swath-${wind}`).first()).toBeAttached();
 await expect(page.getByText(/Hover or tap/)).toBeVisible();
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
 await page.route('**/storms/swaths/AL092022.bin', route=>route.abort());
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
  return {loss, covered:scenario.positions.reduce((s,p)=>s+p.cedentLoss,0), thresholds:[...new Set(scenario.tracts.filter((t,i)=>market.tracts[i].allocations[0]+market.tracts[i].allocations[1]>0).map(t=>t.threshold))]};
 });
 expect(expected.loss).toBeGreaterThan(0);
 expect(expected.thresholds.length).toBeGreaterThan(1);
 const amount=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(expected.loss);
 await expect(page.locator('#market-legend')).toContainText(amount);
 await expect(page.locator('#xol-results > .xol-card').first().locator('dl div').filter({has:page.getByText('Cedent event loss',{exact:true})})).toContainText(new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(expected.covered));
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
 const {gzipSync}=await import('node:zlib');
 await page.route('**/storms/swaths/AL092022.bin',route=>route.fulfill({body:gzipSync(JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',properties:{RADII:34},geometry:{type:'Point',coordinates:[-81,26]}}]}))}));
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
 await expect(page.locator('#market-legend')).toContainText('Cedent covered loss',{timeout:30000});
 const before=await page.locator('#market-legend').innerText();
 await page.getByLabel('Attachment (% of exposure)').fill('101');
 await expect(page.locator('#xol-results')).toContainText('cannot exceed 100%');
 await page.getByLabel('Seed',{exact:true}).fill('43');
 await page.getByRole('button',{name:'Generate'}).click();
 await expect(page.locator('#market-legend')).toContainText('Cedent covered loss',{timeout:30000});
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
 await expect(page.locator('#market-legend')).toContainText('Cedent covered loss');
});

test('source blocks are not in the controls', async ({page}) => {
 await page.goto('/v2/');
 await expect(page.getByText('Sources & assumptions')).toHaveCount(0);
 await expect(page.getByRole('link',{name:/NOAA NHC best track/})).toHaveCount(0);
});

test('archive selects multiple storms and unavailable swaths never produce zero loss', async ({page}) => {
 const {gzipSync}=await import('node:zlib');
 const storms=[{id:'AL012024',name:'Alpha',year:2024,basin:'AL',hasSwath:false},{id:'AL092022',name:'Ian',year:2022,basin:'AL',hasSwath:true}];
 await page.route('**/data/storms/catalog.json',r=>r.fulfill({json:{storms}}));
 await page.route('**/data/storms/tracks.bin',r=>r.fulfill({body:gzipSync(Buffer.from(JSON.stringify(Object.fromEntries(storms.map(s=>[s.id,[{time:'2022-09-23T00:00:00Z',lat:25,lon:-81,wind:40},{time:'2022-09-23T06:00:00Z',lat:26,lon:-80,wind:50}]])))))}));
 await page.route('**/data/storms/swaths/AL092022.bin',async r=>r.fulfill({body:gzipSync(await (await import('node:fs/promises')).readFile('public/data/ian-windswath.geojson'))}));
 await page.goto('/v2/');
 await expect(page.getByLabel('Find an event')).toBeVisible();
 await page.getByLabel('Find an event').fill('Alpha');
 await page.getByRole('checkbox',{name:/Alpha.*2024/}).check();
 await expect(page.locator('.storm-chip-select[aria-pressed=true]')).toContainText('Alpha');
 await page.getByRole('checkbox',{name:/Cedent 01/}).check({timeout:30000});
 await expect(page.locator('#xol-results')).toContainText('unavailable');
 await expect(page.locator('#market-legend')).toContainText('unavailable');
 await expect(page.locator('#xol-results')).not.toContainText('Premium');
 await page.getByLabel('Find an event').fill('Ian');
 await page.getByRole('checkbox',{name:/Ian.*2022/}).check();
 await page.locator('#selected-storms').getByRole('button',{name:/Ian/}).first().click();
 await expect(page.locator('#selected-storms')).toContainText('Alpha');
 await expect(page.locator('#selected-storms')).toContainText('Ian');
 await expect(page.locator('.storm-chip-select[aria-pressed=true]')).toContainText('Ian');
 await expect(page.locator('#xol-results')).toContainText('Investor loss',{timeout:30000});
});

test('timeline preserves observation minutes and missing wind', async ({page})=>{
 const {gzipSync}=await import('node:zlib');
 await page.route('**/data/storms/catalog.json',r=>r.fulfill({json:{storms:[{id:'AL012024',name:'Test',year:2024,basin:'AL',hasSwath:false}]}}));
 await page.route('**/data/storms/tracks.bin',r=>r.fulfill({body:gzipSync(JSON.stringify({AL012024:[{time:'2024-09-01T03:30:00Z',lat:25,lon:-81,wind:null},{time:'2024-09-01T06:30:00Z',lat:26,lon:-80,wind:50}]}))}));
 await page.goto('/v2/');
 await expect(page.locator('#point-time')).toContainText('03:30');
 await expect(page.locator('#point-time')).toContainText('wind unavailable');
});

test('deselected storm does not reappear when its delayed data arrives', async ({page})=>{
 const {gzipSync}=await import('node:zlib');
 const storms=[{id:'AL092022',name:'Ian',year:2022,basin:'AL',hasSwath:true},{id:'AL012024',name:'Alpha',year:2024,basin:'AL',hasSwath:false}];
 await page.route('**/data/storms/catalog.json',r=>r.fulfill({json:{storms}}));
 const track=[{time:'2022-09-23T00:00:00Z',lat:25,lon:-81,wind:40},{time:'2022-09-23T06:00:00Z',lat:26,lon:-80,wind:50}];
 await page.route('**/data/storms/tracks.bin',r=>r.fulfill({body:gzipSync(JSON.stringify({AL092022:track,AL012024:track}))}));
 let release;const gate=new Promise(r=>release=r);
 await page.route('**/data/storms/swaths/AL092022.bin',async r=>{await gate;await r.fulfill({body:gzipSync(await (await import('node:fs/promises')).readFile('public/data/ian-windswath.geojson'))})});
 await page.goto('/v2/');
 await page.getByLabel('Find an event').fill('Ian');
 await page.getByRole('checkbox',{name:/Ian/}).uncheck();
 await page.getByLabel('Find an event').fill('Alpha');
 await page.getByRole('checkbox',{name:/Alpha/}).check();
 release();
 await expect(page.locator('#point-count')).toHaveText('1 / 2');
 await page.waitForTimeout(300);
 await expect(page.locator('.storm-chip-select[aria-pressed=true]')).toContainText('Alpha');
 await expect(page.locator('path.swath-layer')).toHaveCount(0);
 await expect(page.locator('path.archive-track')).toHaveCount(1);
});


test('selected tracks have stable distinct colors and removable accessible chips', async ({page})=>{
 await page.goto('/v2/');
 await expect(page.locator('path.archive-track')).toHaveCount(1);
 await page.getByLabel('Find an event').fill('Katrina');
 await page.getByRole('checkbox',{name:/KATRINA.*2005/i}).first().check();
 await expect(page.locator('path.archive-track')).toHaveCount(2);
 const colors=await page.locator('path.archive-track').evaluateAll(es=>es.map(e=>e.getAttribute('stroke')));
 expect(new Set(colors).size).toBe(2);
 await expect(page.locator('#selected-storms')).toContainText('AL092022');
 await page.getByRole('button',{name:/Remove Ian.*AL092022/i}).click();
 await expect(page.locator('path.archive-track')).toHaveCount(1);
 await expect(page.locator('#selected-storms')).not.toContainText('AL092022');
 await expect(page.locator('path.archive-track')).toHaveAttribute('stroke',colors[1]);
 await expect(page).not.toHaveTitle(/Ian/i);
});


test('failed storm track can be retried independently', async ({page})=>{
 let attempts=0;
 await page.route('**/data/storms/tracks.bin',r=>++attempts===1?r.abort():r.continue());
 await page.goto('/v2/');
 await expect(page.locator('#point-time')).toHaveText('Track unavailable');
 await page.getByRole('button',{name:/Retry data for Ian/i}).click();
 await expect(page.locator('#point-count')).toContainText('1 /');
 expect(attempts).toBe(2);
});

test('empty tracks are unavailable rather than indefinitely loading', async ({page})=>{
 const {gzipSync}=await import('node:zlib');
 await page.route('**/data/storms/tracks.bin',r=>r.fulfill({body:gzipSync(JSON.stringify({AL092022:[]}))}));
 await page.goto('/v2/');
 await expect(page.locator('#point-time')).toHaveText('Track unavailable');
 await expect(page.getByRole('button',{name:/Retry data for Ian/i})).toBeVisible();
});


test('a missing advertised swath offers retry rather than a zero-loss scenario', async ({page})=>{
 const {gzipSync}=await import('node:zlib');
 await page.route('**/storms/swaths/AL092022.bin',r=>r.fulfill({body:gzipSync('null')}));
 await page.goto('/v2/');
 await expect(page.locator('#active-storm')).toContainText('unavailable');
 await expect(page.getByRole('button',{name:/Retry data for Ian/i})).toBeVisible();
});


test('archive browses all storms in descending year order without losing focus', async ({page})=>{
 await page.goto('/v2/');
 const expected=await page.evaluate(async()=> (await (await fetch('/v2/data/storms/catalog.json')).json()).storms.length);
 await expect(page.locator('#storm-list input')).toHaveCount(80);
 const more=page.getByRole('button',{name:/show more/i});
 await more.focus(); await page.keyboard.press('Enter');
 await expect(page.locator('#storm-list input')).toHaveCount(160);
 await expect(more).toBeFocused();
 while(await more.count()) await more.click();
 await expect(page.locator('#storm-list input')).toHaveCount(expected);
 const years=await page.locator('#storm-list label').allTextContents();
 const numbers=years.map(s=>Number(s.match(/ · (\d{4}) · /)[1]));
 expect(numbers.every((y,i)=>!i || numbers[i-1]>=y)).toBe(true);
 await expect(page.getByRole('button',{name:'All shown'})).toBeFocused();
});

for (const [a,b] of [[179,-179],[-179,179]]) {
 test(`antimeridian marker follows short path ${a} to ${b}`,async ({page})=>{
  const {gzipSync}=await import('node:zlib');
  await page.route('**/data/storms/catalog.json',r=>r.fulfill({json:{storms:[{id:'EP012024',name:'Cross',year:2024,basin:'EP',hasSwath:false}]}}));
  await page.route('**/data/storms/tracks.bin',r=>r.fulfill({body:gzipSync(JSON.stringify({EP012024:[{time:'2024-09-01T03:30:00Z',lat:20,lon:a,wind:40},{time:'2024-09-01T06:30:00Z',lat:21,lon:b,wind:50}]}))}));
  await page.goto('/v2/');
  const marker=page.locator('.storm-marker'); await expect(marker).toBeAttached();
  const x=()=>marker.evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
  const start=await x(); await page.getByRole('slider',{name:'Track point'}).fill('0.5');
  const middle=await x(); await expect(page.locator('#point-time')).toContainText('05:00');
  await page.getByRole('slider',{name:'Track point'}).fill('1'); const end=await x();
  expect(Math.abs(end-start)).toBeLessThan(100);
  expect(Math.abs(middle-(start+end)/2)).toBeLessThan(2);
 });
}


test('reselecting a removed storm keeps selected track colors unique',async ({page})=>{
 await page.goto('/v2/'); await expect(page.locator('path.archive-track')).toHaveCount(1);
 await page.getByLabel('Find an event').fill('Katrina');
 await page.getByRole('checkbox',{name:/KATRINA.*2005/i}).first().check();
 await expect(page.locator('path.archive-track')).toHaveCount(2);
 await page.getByRole('button',{name:/Remove Ian.*AL092022/i}).click();
 await page.getByLabel('Find an event').fill('Harvey');
 await page.getByRole('checkbox',{name:/HARVEY.*2017/i}).first().check();
 await page.getByLabel('Find an event').fill('Ian');
 await page.getByRole('checkbox',{name:/Ian.*2022/i}).first().check();
 await expect(page.locator('path.archive-track')).toHaveCount(3);
 const colors=await page.locator('path.archive-track').evaluateAll(es=>es.map(e=>e.getAttribute('stroke')));
 expect(new Set(colors).size).toBe(3);
 const chipColors=await page.locator('.storm-chip').evaluateAll(es=>es.map(e=>e.style.getPropertyValue('--track-color')));
 expect(new Set(chipColors)).toEqual(new Set(colors));
});


test('mock antimeridian track and playback use the same short world path',async ({page})=>{
 const {gzipSync}=await import('node:zlib');
 const track=[{time:'2024-01-01T00:00Z',lat:10,lon:178,wind:40},{time:'2024-01-01T06:00Z',lat:10,lon:179,wind:40},{time:'2024-01-01T12:00Z',lat:10,lon:-179,wind:40},{time:'2024-01-01T18:00Z',lat:10,lon:-178,wind:40}];
 await page.route('**/data/storms/catalog.json',r=>r.fulfill({json:{storms:[{id:'AL012024',name:'Cross',year:2024,basin:'AL',hasSwath:false}]}}));
 await page.route('**/data/storms/tracks.bin',r=>r.fulfill({body:gzipSync(JSON.stringify({AL012024:track}))}));
 await page.route('**/src/main.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+'\nwindow.__testMap=map;'});});
 await page.goto('/v2/');
 await page.getByLabel('Find an event').fill('AL012024');
 await expect(page.getByRole('checkbox',{name:/AL012024/})).toBeChecked();
 await expect(page.locator('.storm-chip-select[aria-pressed=true]')).toContainText('2024');
 const result=await page.evaluate(async()=>{
  const response=await fetch('/v2/data/storms/tracks.bin');
  const tracks=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
  const chronological=Object.values(tracks).every(track=>track.every((p,i)=>!i || Date.parse(track[i-1].time)<Date.parse(p.time)));
  const raw=tracks.AL012024; const crossing=raw.findIndex((p,i)=>i && Math.abs(p.lon-raw[i-1].lon)>180);
  let layer;window.__testMap.eachLayer(l=>{if(l.options?.className==='archive-track' && l.getLatLngs().length===raw.length) layer=l});
  return {chronological, crossing, raw, path:layer?.getLatLngs().map(p=>p.lng)};
 });
 expect(result.chronological).toBe(true); expect(result.crossing).toBeGreaterThan(0); expect(result.path).toHaveLength(result.raw.length);
 expect(result.path.every((x,i)=>!i || Math.abs(x-result.path[i-1])<=180)).toBe(true);
 const slider=page.getByRole('slider',{name:'Track point'});
 await slider.fill(String(result.crossing-0.5));
 const markerLon=()=>page.evaluate(()=>{let lon;window.__testMap.eachLayer(l=>{if(l.options?.icon?.options?.className==='storm-marker')lon=l.getLatLng().lng});return lon});
 expect(await markerLon()).toBeCloseTo((result.path[result.crossing-1]+result.path[result.crossing])/2,4);
 await page.getByRole('button',{name:'Play track'}).click();
 await expect.poll(async()=>Number(await slider.inputValue())).toBeGreaterThan(result.crossing-0.5);
 expect(Math.abs((await markerLon())-result.path[result.crossing])).toBeLessThan(5);
 await page.getByRole('button',{name:'Pause track'}).click();
});


test('eight selected tracks remain distinct after palette overflow and removal',async ({page})=>{
 const {gzipSync}=await import('node:zlib');
 const storms=Array.from({length:9},(_,i)=>({id:`AL${String(i+1).padStart(2,'0')}2024`,name:`Storm ${i+1}`,year:2024,basin:'AL',hasSwath:false}));
 const track=[{time:'2024-09-01T00:00:00Z',lat:25,lon:-81,wind:40},{time:'2024-09-01T06:00:00Z',lat:26,lon:-80,wind:50}];
 await page.route('**/data/storms/catalog.json',r=>r.fulfill({json:{storms}}));
 await page.route('**/data/storms/tracks.bin',r=>r.fulfill({body:gzipSync(JSON.stringify(Object.fromEntries(storms.map(s=>[s.id,track]))))}));
 await page.goto('/v2/');
 for(let i=1;i<=8;i++) await page.getByRole('checkbox',{name:new RegExp(`Storm ${i} ·`)}).check();
 await expect(page.locator('path.archive-track')).toHaveCount(9);
 await page.getByRole('button',{name:/Remove Storm 1 /}).click();
 await expect(page.locator('path.archive-track')).toHaveCount(8);
 const colors=await page.locator('path.archive-track').evaluateAll(es=>es.map(e=>e.getAttribute('stroke')));
 expect(new Set(colors).size).toBe(8);
 const chipColors=await page.locator('.storm-chip').evaluateAll(es=>es.map(e=>e.style.getPropertyValue('--track-color')));
 expect(new Set(chipColors)).toEqual(new Set(colors));
});

test('GIS-only event identifies its preliminary track', async ({page})=>{
 await page.goto('/v2/');
 await page.getByLabel('Find an event').fill('AL012026');
 await page.getByRole('checkbox',{name:/AL012026/}).check();
 await expect(page.locator('.storm-chip-select[aria-pressed=true]')).toContainText('AL012026');
 await expect(page.locator('#active-storm')).toContainText('Preliminary track');
});

test('map offers threshold and observed track details without old controls', async ({page})=>{
 await page.goto('/v2/');
 await expect(page.getByText('Lifetime wind footprint')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Hide track'})).toHaveCount(0);
 await expect(page.getByText(/Hover or tap/)).toBeVisible();
 await expect(page.locator('.track-observation').first()).toBeAttached();
 await page.locator('.track-observation').first().dispatchEvent('mouseover');
 await expect(page.locator('.leaflet-tooltip')).toContainText('kt');
});

test('overlapping events report their strongest cumulative thresholds on hover and tap',async({page})=>{
 const {gzipSync}=await import('node:zlib');
 const polygon=(wind)=>({type:'Feature',properties:{RADII:wind},geometry:{type:'Polygon',coordinates:[[[-84,23],[-78,23],[-78,28],[-84,28],[-84,23]]]}});
 for(const [id,winds] of [['AL092022',[34,64]],['AL122005',[34,50]]]) await page.route(`**/storms/swaths/${id}.bin`,r=>r.fulfill({body:gzipSync(JSON.stringify({type:'FeatureCollection',features:winds.map(polygon)}))}));
 await page.goto('/v2/');
 await page.getByLabel('Find an event').fill('Katrina');
 await page.getByRole('checkbox',{name:/KATRINA.*2005/i}).first().check();
 await expect(page.locator('path.swath-50')).toHaveCount(1);
 const box=await page.locator('#map').boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 const tip=page.locator('.swath-info');
 await expect(tip).toContainText('AL092022: ≥64 kt');
 await expect(tip).toContainText('AL122005: ≥50 kt');
 await expect(tip).toContainText('not an exact wind speed');
 await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
 await expect(tip).toContainText('AL122005');
});

test('real pointer sees track observations and swaths over selected housing and cedent',async({page})=>{
 const {gzipSync}=await import('node:zlib');
 const track=[{time:'2022-09-01T00:00:00Z',lat:25.5,lon:-81,wind:96},{time:'2022-09-01T06:00:00Z',lat:26,lon:-80,wind:null}];
 await page.route('**/data/storms/tracks.bin',r=>r.fulfill({body:gzipSync(JSON.stringify({AL092022:track}))}));
 await page.route('**/storms/swaths/AL092022.bin',r=>r.fulfill({body:gzipSync(JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',properties:{RADII:64},geometry:{type:'Polygon',coordinates:[[[-84,23],[-78,23],[-78,28],[-84,28],[-84,23]]]}}]}))}));
 await page.goto('/v2/');
 await page.getByRole('checkbox',{name:'Housing tracts'}).check();
 await page.getByRole('checkbox',{name:/Cedent 01/}).check();
 await expect(page.locator('.track-observation')).toHaveCount(2);
 const box=await page.locator('#map').boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 await expect(page.locator('.leaflet-tooltip').filter({hasText:'Category 3'})).toContainText('96 kt / 110 mph');
 await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
 await expect(page.locator('.leaflet-popup')).toContainText('Category 3');
 await page.mouse.move(box.x+box.width/2+45,box.y+box.height/2);
 await expect(page.locator('.swath-info')).toContainText('≥64 kt');
 await expect(page.locator('#xol-results')).toContainText('Investor loss');
});

test('touchscreen taps reveal swath thresholds and track observations',async({browser})=>{
 const {gzipSync}=await import('node:zlib');
 const context=await browser.newContext({viewport:{width:375,height:812},hasTouch:true,isMobile:true});
 const page=await context.newPage();
 await page.route('**/data/storms/tracks.bin',r=>r.fulfill({body:gzipSync(JSON.stringify({AL092022:[{time:'2022-09-01T00:00:00Z',lat:25.5,lon:-81,wind:83},{time:'2022-09-01T06:00:00Z',lat:26,lon:-80,wind:null}]}))}));
 await page.route('**/storms/swaths/AL092022.bin',r=>r.fulfill({body:gzipSync(JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',properties:{RADII:50},geometry:{type:'Polygon',coordinates:[[[-84,23],[-78,23],[-78,28],[-84,28],[-84,23]]]}}]}))}));
 await page.goto('http://127.0.0.1:4174/v2/');
 await expect(page.locator('.track-observation')).toHaveCount(2);
 const box=await page.locator('#map').boundingBox();
 await page.touchscreen.tap(box.x+box.width/2-40,box.y+box.height/2);
 await expect(page.locator('.swath-info')).toContainText('≥50 kt');
 await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
 await expect(page.locator('.leaflet-popup').filter({hasText:'Category 2'})).toBeVisible();
 await expect(page.locator('.track-info')).toHaveCount(0);
 await context.close();
});

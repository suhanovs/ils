import {test, expect} from '@playwright/test';

test('year checkbox selects the entire year even through a name filter', async ({page})=>{
 await page.goto('/v2/');
 await expect(page.locator('.storm-chip-select[aria-pressed=true]')).toBeVisible();

 const catalog=await (await page.request.get('/v2/data/storms/catalog.json')).json();
 const count=catalog.storms.filter(s=>s.year===2022).length;
 await page.getByLabel('Find an event').fill('IAN');
 const year=page.getByRole('checkbox',{name:'Select all 2022 events'});
 await year.check();
 await expect(page.locator('.storm-chip')).toHaveCount(count);
 await expect(page.locator('#selected-storms')).not.toContainText('AL092026');
 await expect(year).toBeChecked();
});

test('year search is exact, selecting it replaces only the untouched default',async ({page})=>{
 await page.goto('/v2/');
 await page.getByLabel('Find an event').fill('2020');
 await expect(page.getByRole('checkbox',{name:'Select all 2023 events'})).toHaveCount(0);
 await expect(page.getByRole('checkbox',{name:'Select all 2021 events'})).toHaveCount(0);
 await page.getByRole('checkbox',{name:'Select all 2020 events'}).check();
 await expect(page.locator('.storm-chip')).toHaveCount(30);
 await expect(page.locator('.map-label')).toHaveCount(0);
});

test('year selection preserves a manually chosen event from another year',async ({page})=>{
 await page.goto('/v2/');
 await page.getByLabel('Find an event').fill('IAN');
 await page.getByRole('checkbox',{name:/IAN · 2022/}).check();
 await page.getByLabel('Find an event').fill('2020');
 await page.getByRole('checkbox',{name:'Select all 2020 events'}).check();
 await expect(page.locator('#selected-storms')).toContainText('AL092022');
 await expect(page.locator('.storm-chip')).toHaveCount(32);
 await expect(page.locator('.map-label')).toHaveCount(0);
});

test('different calendar dates and advisory intervals advance together by elapsed time',async ({page})=>{
 const {gzipSync}=await import('node:zlib');
 const storms=[{id:'AL012024',name:'Alpha',year:2024,basin:'AL',hasSwath:false},{id:'AL022024',name:'Beta',year:2024,basin:'AL',hasSwath:false}];
 const tracks={AL012024:[{time:'2024-02-01T00:00Z',lat:20,lon:-80,wind:30},{time:'2024-02-01T03:00Z',lat:23,lon:-77,wind:90},{time:'2024-02-01T12:00Z',lat:32,lon:-68,wind:110}],AL022024:[{time:'2024-08-01T00:00Z',lat:10,lon:-60,wind:30},{time:'2024-08-01T06:00Z',lat:16,lon:-54,wind:90}]};
 await page.route('**/data/storms/catalog.json',r=>r.fulfill({json:{storms}}));
 await page.route('**/data/storms/tracks.bin',r=>r.fulfill({body:gzipSync(JSON.stringify(tracks))}));
 await page.goto('/v2/');await page.getByRole('checkbox',{name:'Select all 2024 events'}).check();
 const slider=page.getByRole('slider',{name:'Elapsed time'});await expect(slider).toBeEnabled();
 await expect(slider).toHaveAttribute('max',String(12*3600000));
 const alpha=page.locator('.storm-marker[data-storm-id="AL012024"]'),beta=page.locator('.storm-marker[data-storm-id="AL022024"]');
 await expect(alpha).toHaveCount(1);await expect(beta).toHaveCount(1);
 const before=await alpha.boundingBox(), beforeBeta=await beta.boundingBox(), initialHue=await alpha.locator('.storm-symbol').evaluate(e=>e.style.getPropertyValue('--storm-hue'));
 await slider.fill(String(3*3600000));
 const after=await alpha.boundingBox(), afterBeta=await beta.boundingBox(), betaHue=await beta.locator('.storm-symbol').evaluate(e=>e.style.getPropertyValue('--storm-hue'));
 expect(after.x).not.toBe(before.x);expect(after.y).not.toBe(before.y);
 expect((after.x-before.x)/(afterBeta.x-beforeBeta.x)).toBeCloseTo(2, 0);
 expect(await alpha.locator('.storm-symbol').evaluate(e=>e.style.getPropertyValue('--storm-hue'))).not.toBe(initialHue);
 expect(Number(betaHue)).toBeCloseTo(39.3, 2);
 expect(Number(await alpha.locator('.storm-symbol').evaluate(e=>e.style.getPropertyValue('--storm-hue')))).toBeCloseTo(22.2,2);
 expect(betaHue).not.toBe(await alpha.locator('.storm-symbol').evaluate(e=>e.style.getPropertyValue('--storm-hue')));
 await slider.fill(String(7*3600000));await expect(beta).toHaveCount(1);await expect(alpha).toHaveCount(1);
 await slider.fill(String(12*3600000));await expect(beta).toHaveCount(1);await expect(alpha).toHaveCount(1);
 const endAlpha=await alpha.boundingBox(),endBeta=await beta.boundingBox();
 expect((endAlpha.x-before.x)/(endBeta.x-beforeBeta.x)).toBeCloseTo(2,1);
});

test('year playback uses longest elapsed track and retains all events', async ({page})=>{
 await page.goto('/v2/');
 await page.getByLabel('Find an event').fill('2026');
 await page.getByRole('checkbox',{name:'Select all 2026 events'}).check();
 await expect(page.locator('.storm-chip')).toHaveCount(10);
 const slider=page.getByRole('slider',{name:'Elapsed time'});
 await expect(slider).toBeEnabled({timeout:30000});
 await expect(slider).toHaveAttribute('max',String(246*3600000));
 await expect(page.locator('#point-time')).toContainText('Day 1 + 0h');
 await expect(page.locator('.storm-marker')).toHaveCount(10);
 await slider.fill(String(25*3600000));
 await expect(page.locator('.storm-marker')).toHaveCount(10);
 await page.getByRole('button',{name:'Play track'}).click();
 await expect.poll(async()=>Number(await slider.inputValue())).toBeGreaterThan(25*3600000);
});

test('group playback keeps financial results on the active event',async ({page})=>{
 await page.goto('/v2/');await page.getByLabel('Find an event').fill('2020');
 await page.getByRole('checkbox',{name:'Select all 2020 events'}).check();
 const slider=page.getByRole('slider',{name:'Elapsed time'});await expect(slider).toBeEnabled();
 await page.locator('#cedent-list input').first().check();
 const out=page.locator('#xol-results');await expect(out).toContainText('Portfolio · IOTA (2020)',{timeout:30000});
 await page.getByRole('button',{name:'ETA (2020) · AL292020',exact:true}).click();
 await expect(out).toContainText('Portfolio · ETA (2020)',{timeout:30000});
 await expect(page.locator('#xol-status')).toHaveText('');
 const before=await out.innerText();await slider.fill(String(12*3600000));
 expect(await out.innerText()).toBe(before);
});

test('returning to one selected event restores its single-track controls', async ({page})=>{
 await page.goto('/v2/');
 await page.locator('.storm-chip-select[aria-pressed=true]').click();
 await page.getByLabel('Find an event').fill('2022');
 await page.getByRole('checkbox',{name:'Select all 2022 events'}).check();
 const slider=page.getByRole('slider',{name:'Elapsed time'});
 await expect(slider).toBeEnabled({timeout:30000});
 await expect(slider).toHaveAttribute('max',String(366*3600000));
 await page.getByRole('checkbox',{name:'Select all 2022 events'}).uncheck();
 await expect(page.getByRole('slider',{name:'Track point'})).toBeEnabled();
 await expect(page.locator('.storm-marker')).toHaveCount(1);
});

test('mobile year selection is tri-state and labels the elapsed timeline', async ({page})=>{
 await page.setViewportSize({width:375,height:812});
 await page.goto('/v2/');
 await page.getByLabel('Find an event').fill('2026');
 const year=page.getByRole('checkbox',{name:'Select all 2026 events'});
 await expect(year).toHaveJSProperty('indeterminate',true);
 await year.focus();await page.keyboard.press('Space');
 await expect(year).toBeChecked();
 await expect(page.getByRole('slider',{name:'Elapsed time'})).toBeEnabled();
 await expect(page.locator('.timeline-foot')).toContainText('SYNCED PROGRESS');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('a newly selected group starts at day one after clearing the prior group', async ({page})=>{
 await page.goto('/v2/'); await page.getByLabel('Find an event').fill('2026');
 const year=page.getByRole('checkbox',{name:'Select all 2026 events'});await year.check();
 const slider=page.getByRole('slider',{name:'Elapsed time'});await expect(slider).toBeEnabled();
 await slider.fill(String(25*3600000));await year.uncheck();await year.check();
 await expect(slider).toHaveValue('0');
});

test('a delayed deselected event cannot reappear or reset group playback', async ({page})=>{
 const {gzipSync}=await import('node:zlib'); let release;const gate=new Promise(r=>release=r);
 const storms=[1,2,3].map(i=>({id:`AL0${i}2024`,name:`Storm${i}`,year:2024,basin:'AL',hasSwath:i===1}));
 const tracks=Object.fromEntries(storms.map((s,i)=>[s.id,[{time:'2024-01-01T00:00Z',lat:20+i,lon:-70,wind:40},{time:'2024-01-01T01:30Z',lat:21+i,lon:-69,wind:45},{time:'2024-01-01T05:15Z',lat:22+i,lon:-68,wind:50}]]));
 await page.route('**/data/storms/catalog.json',r=>r.fulfill({json:{storms}}));
 await page.route('**/data/storms/tracks.bin',r=>r.fulfill({body:gzipSync(JSON.stringify(tracks))}));
 await page.route('**/data/storms/swaths/AL012024.bin',async r=>{await gate;await r.fulfill({body:gzipSync(JSON.stringify({type:'FeatureCollection',features:[]}))})});
 await page.goto('/v2/');await page.getByRole('checkbox',{name:'Select all 2024 events'}).check();
 const slider=page.getByRole('slider',{name:'Elapsed time'});await expect(slider).toBeDisabled();
 await page.getByRole('checkbox',{name:/Storm1 · 2024/}).uncheck();
 await expect(slider).toBeEnabled();await slider.fill(String(90*60000));
 await expect(page.locator('#point-time')).toHaveText('Day 1 + 1h 30m');
 release();await page.waitForTimeout(200);
 await expect(slider).toHaveValue(String(90*60000));await expect(page.locator('.storm-marker')).toHaveCount(2);
});

test('failed group track requires retry before playback',async ({page})=>{
 const {gzipSync}=await import('node:zlib');let fail=true;
 const storms=[1,2].map(i=>({id:`AL0${i}2024`,name:`Storm${i}`,year:2024,basin:'AL',hasSwath:false}));
 const tracks=Object.fromEntries(storms.map((s,i)=>[s.id,[{time:'2024-01-01T00:00Z',lat:20+i,lon:-70,wind:40},{time:'2024-01-01T02:30Z',lat:21+i,lon:-69,wind:45}]]));
 await page.route('**/data/storms/catalog.json',r=>r.fulfill({json:{storms}}));
 await page.route('**/data/storms/tracks.bin',r=>fail?r.fulfill({status:503}):r.fulfill({body:gzipSync(JSON.stringify(tracks))}));
 await page.goto('/v2/');await page.getByRole('checkbox',{name:'Select all 2024 events'}).check();
 await expect(page.getByRole('slider',{name:'Elapsed time'})).toBeDisabled();
 await expect(page.getByRole('button',{name:/Retry data/})).toHaveCount(2);
 fail=false;await page.getByRole('button',{name:/Retry data.*Storm1/}).click();
 await page.getByRole('button',{name:/Retry data.*Storm2/}).click();
 await expect(page.getByRole('slider',{name:'Elapsed time'})).toBeEnabled();
 await expect(page.locator('.storm-marker')).toHaveCount(2);
});

test('retrying a failed selected swath pauses and disables group playback during reload', async ({page})=>{
 const {gzipSync}=await import('node:zlib');let attempt=0,release;const gate=new Promise(r=>release=r);
 const storms=[1,2].map(i=>({id:`AL0${i}2024`,name:`Storm${i}`,year:2024,basin:'AL',hasSwath:i===1}));
 const tracks=Object.fromEntries(storms.map((s,i)=>[s.id,[{time:'2024-01-01T00:00Z',lat:20+i,lon:-70,wind:40},{time:'2024-01-01T02:30Z',lat:21+i,lon:-69,wind:45}]]));
 await page.route('**/data/storms/catalog.json',r=>r.fulfill({json:{storms}}));await page.route('**/data/storms/tracks.bin',r=>r.fulfill({body:gzipSync(JSON.stringify(tracks))}));
 await page.route('**/data/storms/swaths/AL012024.bin',async r=>{if(++attempt===1)return r.fulfill({status:503});await gate;await r.fulfill({body:gzipSync(JSON.stringify({type:'FeatureCollection',features:[]}))})});
 await page.goto('/v2/');await page.getByRole('checkbox',{name:'Select all 2024 events'}).check();
 const play=page.getByRole('button',{name:'Play track'});await expect(play).toBeEnabled();await play.click();
 await page.getByRole('button',{name:/Retry data.*Storm1/}).click();
 await expect(page.getByRole('button',{name:'Play track'})).toBeDisabled();
 release();await expect(page.getByRole('button',{name:'Play track'})).toBeEnabled();
});

test('archive visually nests events under their year',async ({page})=>{
 await page.goto('/v2/');await page.getByLabel('Find an event').fill('2026');
 const parent=page.getByRole('checkbox',{name:'Select all 2026 events'});
 const child=page.locator('#storm-list [data-storm-id]').first();
 const [a,b]=await Promise.all([parent.boundingBox(),child.boundingBox()]);
 expect(b.x).toBeGreaterThan(a.x);
});


test('map removes the Leaflet flag and retains OpenStreetMap attribution',async ({page})=>{
 await page.goto('/v2/');
 await expect(page.locator('.map-label')).toHaveCount(0);
 await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');
 await expect(page.locator('.leaflet-control-attribution svg')).toHaveCount(0);
});

test('group markers move at subpixel precision across fine scrub increments',async ({page})=>{
 const {gzipSync}=await import('node:zlib');
 const storms=[1,2].map(i=>({id:`AL0${i}2024`,name:`Storm${i}`,year:2024,basin:'AL',hasSwath:false}));
 const tracks=Object.fromEntries(storms.map((s,i)=>[s.id,[{time:'2024-01-01T00:00Z',lat:20+i,lon:-70,wind:40},{time:'2024-01-01T06:00Z',lat:21+i,lon:-69,wind:80}]]));
 await page.route('**/data/storms/catalog.json',r=>r.fulfill({json:{storms}}));
 await page.route('**/data/storms/tracks.bin',r=>r.fulfill({body:gzipSync(JSON.stringify(tracks))}));
 await page.goto('/v2/');await page.getByRole('checkbox',{name:'Select all 2024 events'}).check();
 const slider=page.getByRole('slider',{name:'Elapsed time'});await expect(slider).toBeEnabled();
 const marker=page.locator('.storm-marker[data-storm-id="AL012024"]');
 const xs=[];for(let i=0;i<8;i++){await slider.fill(String(i*60000));xs.push((await marker.boundingBox()).x)}
 for(let i=1;i<xs.length;i++)expect(xs[i]).toBeGreaterThan(xs[i-1]);
});


test('real playback renders fractional positions and resumes after pause and zoom',async ({page})=>{
 const {gzipSync}=await import('node:zlib');
 const storms=[1,2].map(i=>({id:`AL0${i}2024`,name:`Storm${i}`,year:2024,basin:'AL',hasSwath:false}));
 const tracks=Object.fromEntries(storms.map((s,i)=>[s.id,[{time:'2024-01-01T00:00Z',lat:20+i,lon:-70,wind:40},{time:'2024-01-03T12:00Z',lat:21+i,lon:-69,wind:80}]]));
 await page.route('**/data/storms/catalog.json',r=>r.fulfill({json:{storms}}));
 await page.route('**/data/storms/tracks.bin',r=>r.fulfill({body:gzipSync(JSON.stringify(tracks))}));
 await page.goto('/v2/');await expect(page.getByRole('button',{name:'Play track'})).toBeEnabled();
 async function sample(){return page.evaluate(()=>new Promise(resolve=>{const xs=[];function frame(){const m=document.querySelector('.storm-marker');xs.push(m.getBoundingClientRect().x);if(xs.length<20)requestAnimationFrame(frame);else resolve(xs)}requestAnimationFrame(frame)}))}
 await page.getByRole('button',{name:'Play track'}).click();let xs=await sample();expect(new Set(xs).size).toBeGreaterThan(10);expect(xs.some(x=>x%1!==0)).toBeTruthy();
 await page.getByRole('button',{name:'Pause track'}).click();const paused=await page.getByRole('slider',{name:'Track point'}).inputValue();await page.waitForTimeout(100);expect(await page.getByRole('slider',{name:'Track point'}).inputValue()).toBe(paused);
 await page.getByRole('checkbox',{name:'Select all 2024 events'}).check();await expect(page.getByRole('slider',{name:'Elapsed time'})).toBeEnabled();
 await page.getByRole('button',{name:'Zoom in'}).click();await page.getByRole('button',{name:'Play track'}).click();xs=await sample();expect(new Set(xs).size).toBeGreaterThan(10);expect(xs.some(x=>x%1!==0)).toBeTruthy();
 await page.getByRole('button',{name:'Pause track'}).click();const slider=page.getByRole('slider',{name:'Elapsed time'});await slider.fill(await slider.getAttribute('max'));await page.getByRole('button',{name:'Play track'}).click();await expect.poll(async()=>Number(await slider.inputValue())).toBeLessThan(Number(await slider.getAttribute('max'))/2);
});

for(const group of [false,true]) test(`${group?'group':'single'} playback does not jump forward after a long frame stall`,async ({page})=>{
 const {gzipSync}=await import('node:zlib');
 const storms=[1,2].map(i=>({id:`AL0${i}2024`,name:`Storm${i}`,year:2024,basin:'AL',hasSwath:false}));
 const tracks=Object.fromEntries(storms.map((s,i)=>[s.id,[{time:'2024-01-01T00:00Z',lat:20+i,lon:-70,wind:40},{time:'2024-01-03T12:00Z',lat:21+i,lon:-69,wind:80}]]));
 await page.route('**/data/storms/catalog.json',r=>r.fulfill({json:{storms}}));
 await page.route('**/data/storms/tracks.bin',r=>r.fulfill({body:gzipSync(JSON.stringify(tracks))}));
 await page.goto('/v2/');if(group)await page.getByRole('checkbox',{name:'Select all 2024 events'}).check();
 await expect(page.getByRole('slider',{name:group?'Elapsed time':'Track point'})).toBeEnabled();
 await page.getByRole('button',{name:'Play track'}).click();
 const delta=await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{
  const slider=document.querySelector('#timeline'),group=slider.getAttribute('aria-label')==='Elapsed time';
  const before=Number(slider.value),until=performance.now()+500;
  while(performance.now()<until){};
  requestAnimationFrame(()=>resolve({delta:Number(slider.value)-before,group}));
 })));
 expect(delta.delta).toBeGreaterThan(0);
 expect(delta.delta).toBeLessThan(delta.group?2*3600000:2/60);
});

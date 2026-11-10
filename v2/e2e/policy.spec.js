import {test,expect} from '@playwright/test';

test('policy terms update covered loss without changing gross damage', async ({page})=>{
 await page.goto('/v2/');
 await page.getByRole('checkbox',{name:/Cedent 01/}).check({timeout:30000});
 const legend=page.locator('#market-legend'), results=page.locator('#xol-results');
 await expect(results).toContainText('Investor loss',{timeout:30000});
 await expect(legend).toContainText('Gross damage');
 const gross=await legend.locator('[data-gross]').innerText();
 const covered=await legend.locator('[data-covered]').innerText();
 await page.getByLabel('Policy deductible (% of replacement value)').fill('10');
 await expect(legend.locator('[data-covered]')).not.toHaveText(covered);
 await expect(legend.locator('[data-gross]')).toHaveText(gross);
 await page.getByLabel('Policy limit (% of replacement value)').fill('0');
 await expect(legend.locator('[data-covered]')).toHaveText('$0');
 await expect(results).toContainText('Cedent event loss');
 await expect(results.locator('.xol-card').first().locator('dl div').filter({has:page.getByText('Cedent event loss',{exact:true})})).toContainText('$0');
 await page.getByLabel('Policy limit (% of replacement value)').fill('');
 await expect(results).toContainText('policy');
 await expect(legend).toContainText('Gross damage');
 await expect(legend).not.toContainText('Cedent covered loss: $0');
});


test('custom policy terms reconcile with engine and discard pending selection', async ({page})=>{
 await page.goto('/v2/');
 await page.getByRole('checkbox',{name:/Cedent 01/}).check({timeout:30000});
 await page.getByLabel('Attachment (% of exposure)').fill('0');
 await page.getByLabel('Policy deductible (% of replacement value)').fill('10');
 await page.getByLabel('Policy limit (% of replacement value)').fill('5');
 const expected=await page.evaluate(async()=>{
  const {generateMarket}=await import('/v2/src/market.js');
  const {simulatePortfolio}=await import('/v2/src/loss.js');
  const r=await fetch('/v2/data/fl-tracts.bin');
  const features=(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json()).features;
  return simulatePortfolio({features,market:generateMarket(features,42),event:window.stormSwath,capital:1000000,positions:[{index:0,weight:1,attachmentFraction:0,limitFraction:.08,rateOnLine:.1,policyDeductibleFraction:.1,policyLimitFraction:.05}]});
 });
 const format=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
 const p=expected.positions[0], rows=page.locator('#xol-results > .xol-card').first();
 for(const [label,value] of [['Gross damage',p.grossDamage],['Deductible',p.deductible],['Above policy limit',p.grossDamage-p.deductible-p.coveredLoss],['Cedent event loss',p.cedentLoss],['Layer ceded loss',p.cededLoss],['Investor loss',p.investorLoss],['Premium',p.premium],['Net',p.netReturn]])
  await expect(rows.locator('dl div').filter({has:page.getByText(label,{exact:true})})).toContainText(format(value),{timeout:30000});
 await expect(page.locator('[data-covered]')).toHaveText(format(p.cedentLoss));
 await page.getByLabel('Policy deductible (% of replacement value)').fill('30');
 await page.getByRole('checkbox',{name:/Cedent 01/}).uncheck();
 await expect(page.locator('#xol-results')).toHaveText('Select cedents to model the event.');
 await page.waitForTimeout(300);
 await expect(page.locator('#xol-results')).not.toContainText('Investor loss');
});

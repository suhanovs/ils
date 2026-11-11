import { expect } from '@playwright/test';

// Ian-specific scenarios must not depend on whichever storm is newest.
export async function selectIan(page) {
  await expect(page.locator('.storm-chip-select[aria-pressed=true]')).toContainText('AL092026');
  await page.getByRole('button', {name:/Remove .*AL092026/i}).click();
  await page.getByLabel('Find an event').fill('Ian');
  await page.getByRole('checkbox', {name:/Ian.*2022/i}).check();
  await expect(page.locator('.storm-chip-select[aria-pressed=true]')).toContainText('AL092022');
}

// Use for tests whose first automatic data request is deliberately intercepted.
export async function useIanCatalog(page) {
  await page.route('**/data/storms/catalog.json', route => route.fulfill({
    json: {storms: [{id:'AL092022', name:'Ian', year:2022, basin:'AL', hasSwath:true}]}
  }));
}

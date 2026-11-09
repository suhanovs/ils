import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./e2e',use:{baseURL:'http://127.0.0.1:4174',headless:true},webServer:{command:'npm run dev -- --port 4174',url:'http://127.0.0.1:4174/v2/',reuseExistingServer:false}});

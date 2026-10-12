import { defineConfig } from '@playwright/test';
export default defineConfig({ globalSetup:'./verification/server-ready.ts',testDir:'browser',workers:1,retries:0,use:{baseURL:process.env.FB01_URL??'http://127.0.0.1:4175',headless:true,launchOptions:process.env.FB01_BROWSER?{executablePath:process.env.FB01_BROWSER}:{}},reporter:'list',outputDir:'test-results' });

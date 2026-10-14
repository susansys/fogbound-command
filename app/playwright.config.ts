import { defineConfig } from "@playwright/test";
export default defineConfig({
  globalSetup: "./verification/server-ready.ts",
  testDir: "browser",
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.FB01_URL ?? "http://127.0.0.1:4175",
    headless: process.env.FB01_HEADED !== '1',
    screenshot:'only-on-failure',
    launchOptions: {
      ...(process.env.FB01_BROWSER?{executablePath:process.env.FB01_BROWSER}:{}),
      ...(process.env.MAP_A_SOFTWARE_GL==='1'?{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{}),
    },
  },
  reporter: "list",
  outputDir: "test-results",
});

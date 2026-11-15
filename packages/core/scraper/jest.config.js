const { nestConfig } = require('@repo/jest-config');

/**
 * *.browser.spec.ts files need a real Chromium (pnpm exec playwright install
 * chromium) and are run by hand: pnpm --filter @repo/core-scraper test:browser
 */
/** @type {import('jest').Config} */
module.exports = {
  ...nestConfig,
  collectCoverage: false,
  testPathIgnorePatterns: process.env.BROWSER_TESTS ? [] : ['\\.browser\\.spec\\.ts$'],
};

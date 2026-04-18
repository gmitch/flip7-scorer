const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'https://gmitch.github.io/flip7-scorer/',
    headless: true,
  },
  timeout: 15000,
});

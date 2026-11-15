const { nestConfig } = require('@repo/jest-config');

/** @type {import('jest').Config} */
module.exports = { ...nestConfig, collectCoverage: false };

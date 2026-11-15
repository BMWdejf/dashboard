import { describe, expect, it } from '@jest/globals';

import { EnvError, flexiEnv, loadEnv, shoptetEnv } from './index';

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv(shoptetEnv, { SHOPTET_PRIVATE_API_TOKEN: 't' });
    expect(env.SHOPTET_API_URL).toBe('https://api.myshoptet.com');
  });

  it('defaults Flexi writes to dry-run', () => {
    const env = loadEnv(flexiEnv, {
      FLEXI_URL: 'https://demo.flexibee.eu:5434',
      FLEXI_COMPANY: 'demo',
      FLEXI_USER: 'u',
      FLEXI_PASSWORD: 'p',
    });
    expect(env.FLEXI_DRY_RUN).toBe(true);
  });

  it('lists every missing variable', () => {
    expect(() => loadEnv(flexiEnv, {})).toThrow(EnvError);
    try {
      loadEnv(flexiEnv, {});
    } catch (e) {
      expect((e as EnvError).issues).toHaveLength(4);
    }
  });
});

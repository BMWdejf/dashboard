import { describe, expect, it } from '@jest/globals';

import { EnvError, flexiEnv, integrationChecksEnv, loadEnv, serverEnv, shoptetEnv } from './index';

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

  it('keeps private networks closed to integration checks by default', () => {
    expect(loadEnv(integrationChecksEnv, {}).FLEXI_CHECK_ALLOW_PRIVATE).toBe(false);
    expect(loadEnv(integrationChecksEnv, { FLEXI_CHECK_ALLOW_PRIVATE: 'true' }).FLEXI_CHECK_ALLOW_PRIVATE).toBe(true);
    expect(() => loadEnv(integrationChecksEnv, { FLEXI_CHECK_ALLOW_PRIVATE: 'yes' })).toThrow(EnvError);
  });

  it('reads the API port from PORT, 3000 by default', () => {
    expect(loadEnv(serverEnv, {}).PORT).toBe(3000);
    expect(loadEnv(serverEnv, { PORT: '10000' }).PORT).toBe(10000);
    expect(() => loadEnv(serverEnv, { PORT: 'abc' })).toThrow(EnvError);
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

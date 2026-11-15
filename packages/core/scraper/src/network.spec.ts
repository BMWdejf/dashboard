import { describe, expect, it } from '@jest/globals';

import { hostAllowed, isPrivateHost } from './network';

describe('isPrivateHost', () => {
  it.each([
    'localhost',
    'api.localhost',
    'printer.local',
    'db.internal',
    'intranet',
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.1',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '[::1]',
    '[fd00::1]',
    '[fe80::1]',
    '[::ffff:127.0.0.1]',
  ])('blocks %s', (h) => expect(isPrivateHost(h)).toBe(true));

  it.each(['shop.example.com', '8.8.8.8', '172.32.0.1', '[2606:4700::1111]'])(
    'allows %s',
    (h) => expect(isPrivateHost(h)).toBe(false),
  );
});

describe('hostAllowed', () => {
  const hosts = ['shop.example.com'];
  it('needs http(s) and a listed host', () => {
    expect(hostAllowed(hosts, 'https://shop.example.com/a')).toBe(true);
    expect(hostAllowed(hosts, 'https://other.example.com/a')).toBe(false);
    expect(hostAllowed(hosts, 'ftp://shop.example.com/a')).toBe(false);
    expect(hostAllowed(hosts, 'not a url')).toBe(false);
  });

  it('never allows a private host, even when listed', () => {
    expect(hostAllowed(['localhost'], 'http://localhost:3000/')).toBe(false);
  });
});

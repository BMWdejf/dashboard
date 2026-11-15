import { describe, expect, it } from '@jest/globals';

import { hostAllowed, isPrivateHost } from './network';

/** Hosts as the browser and our code see them: normalised by the URL parser. */
const host = (h: string) => new URL(`http://${h}/`).hostname;

describe('isPrivateHost', () => {
  it.each([
    'localhost',
    'localhost.',
    'api.localhost',
    'printer.local',
    'printer.local.',
    'db.internal',
    'intranet',
    '127.0.0.1',
    '127.1',
    '2130706433',
    '0x7f.1',
    '10.1.2.3',
    '172.20.0.1',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '[::]',
    '[::1]',
    '[::ffff:127.0.0.1]',
    '[::ffff:169.254.169.254]',
    '[::ffff:0:a00:1]',
    '[::127.0.0.1]',
    '[64:ff9b::a9fe:a9fe]',
    '[64:ff9b:1::1]',
    '[2002:7f00:1::]',
    '[2001:0:4136:e378::1]',
    '[fd00::1]',
    '[fe80::1]',
    '[ff02::1]',
  ])('blocks %s', (h) => expect(isPrivateHost(host(h))).toBe(true));

  it.each([
    'shop.example.com',
    'shop.example.com.',
    '8.8.8.8',
    '172.32.0.1',
    '[2606:4700::1111]',
    '[64:ff9b::808:808]',
    '[2002:808:808::]',
  ])('allows %s', (h) => expect(isPrivateHost(host(h))).toBe(false));
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

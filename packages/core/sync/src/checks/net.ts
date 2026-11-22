import { BlockList, isIP } from 'node:net';

import type { CheckDeps, CheckStep } from './types';

/**
 * Never reachable from a check: loopback, link-local (cloud metadata),
 * unspecified, multicast, CGNAT, and IPv6 prefixes that embed an IPv4 address
 * (NAT64, 6to4, Teredo, IPv4-compatible). Node's BlockList also matches
 * IPv4-mapped IPv6 in any spelling (::ffff:127.0.0.1 = ::ffff:7f00:1).
 */
const ALWAYS_BLOCKED = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['100.64.0.0', 10],
  ['192.0.0.0', 24],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  ALWAYS_BLOCKED.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['2001::', 32],
  ['2002::', 16],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  ALWAYS_BLOCKED.addSubnet(net, prefix, 'ipv6');
}
ALWAYS_BLOCKED.addAddress('::1', 'ipv6');

/** Private networks: allowed only for a self-hosted Flexi on the LAN. */
const PRIVATE = new BlockList();
PRIVATE.addSubnet('10.0.0.0', 8, 'ipv4');
PRIVATE.addSubnet('172.16.0.0', 12, 'ipv4');
PRIVATE.addSubnet('192.168.0.0', 16, 'ipv4');
PRIVATE.addSubnet('fc00::', 7, 'ipv6');

/** A literal IPv4 or IPv6 address (brackets allowed), or null for a host name. */
export function ipLiteral(host: string): { address: string; family: 'ipv4' | 'ipv6' } | null {
  const address = host.replace(/^\[|\]$/g, '');
  const v = isIP(address);
  return v === 4 ? { address, family: 'ipv4' } : v === 6 ? { address, family: 'ipv6' } : null;
}

/**
 * Whether the server may connect to this address. Anything that isn't a valid
 * IP literal is refused; private ranges only when `allowPrivate`.
 */
export function addressAllowed(ip: string, allowPrivate: boolean): boolean {
  const lit = ipLiteral(ip);
  if (!lit) return false;
  if (ALWAYS_BLOCKED.check(lit.address, lit.family)) return false;
  return allowPrivate || !PRIVATE.check(lit.address, lit.family);
}

/** A private-network address (10/8, 172.16/12, 192.168/16, fc00::/7, also IPv4-mapped). */
export function isPrivateAddress(ip: string): boolean {
  const lit = ipLiteral(ip);
  return !!lit && PRIVATE.check(lit.address, lit.family);
}

type LookupAddress = { address: string; family: number };
type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;
type BaseLookup = (
  hostname: string,
  options: { all: true; family?: number; hints?: number },
  callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void;

/**
 * A `lookup` for net/tls `connect` (undici Agent `connect.lookup`) that refuses
 * any resolved address `addressAllowed` rejects. It runs at connect time, so
 * the connection goes only to an address that passed the check: a DNS answer
 * that changes between the "dns" step and the request (rebinding) is caught.
 */
export function guardedLookup(allowPrivate: boolean, base: BaseLookup) {
  return (hostname: string, options: { all?: boolean; family?: number; hints?: number }, callback: LookupCallback) => {
    base(hostname, { family: options.family, hints: options.hints, all: true }, (err, addresses) => {
      if (err) return callback(err, '');
      const bad = addresses.find((a) => !addressAllowed(a.address, allowPrivate));
      if (bad || addresses.length === 0) {
        const e: NodeJS.ErrnoException = new Error(`Address not allowed for ${hostname}`);
        e.code = 'EADDRBLOCKED';
        return callback(e, '');
      }
      if (options.all) return callback(null, addresses);
      callback(null, addresses[0]!.address, addresses[0]!.family);
    });
  };
}

/** Resolves the host and checks every address; the "dns" step. */
export async function resolveStep(
  host: string,
  deps: CheckDeps,
  allowPrivate: boolean,
): Promise<CheckStep> {
  const lit = ipLiteral(host);
  const bare = lit?.address ?? host;
  let addresses: string[];
  if (lit) {
    addresses = [lit.address];
  } else if (host.includes(':')) {
    return { key: 'dns', status: 'failed', code: 'notFound', params: { host } };
  } else {
    try {
      addresses = await deps.lookup(bare);
    } catch {
      return { key: 'dns', status: 'failed', code: 'notFound', params: { host: bare } };
    }
  }
  if (addresses.length === 0) return { key: 'dns', status: 'failed', code: 'notFound', params: { host: bare } };
  const blocked = addresses.find((a) => !addressAllowed(a, allowPrivate));
  // The address itself is not echoed: it could reveal internal DNS.
  if (blocked) return { key: 'dns', status: 'failed', code: 'blocked' };
  return { key: 'dns', status: 'ok', code: 'resolved', params: { address: addresses[0]! } };
}

/** Why a fetch failed, from undici's error causes. */
export function networkFailure(e: unknown): {
  code: 'timeout' | 'refused' | 'tls' | 'unreachable' | 'blocked';
  reason: string;
} {
  const err = e as { name?: string; code?: string; cause?: { code?: string; name?: string } };
  const code = err.cause?.code ?? err.code ?? '';
  const name = err.name === 'TypeError' ? (err.cause?.name ?? '') : (err.name ?? '');
  if (name === 'TimeoutError' || name === 'AbortError' || /TIMEOUT|ETIMEDOUT/.test(code)) {
    return { code: 'timeout', reason: code || name };
  }
  if (code === 'EADDRBLOCKED') return { code: 'blocked', reason: code };
  if (/^(ECONNREFUSED|ECONNRESET|EPIPE)$/.test(code)) return { code: 'refused', reason: code };
  if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY|HOSTNAME_MISMATCH|ALTNAME/.test(code)) {
    return { code: 'tls', reason: code };
  }
  return { code: 'unreachable', reason: code || 'fetch failed' };
}

/** A step marked as not run because an earlier one failed. */
export const skipped = (key: string): CheckStep => ({ key, status: 'skipped', code: 'skipped' });

export const allOk = (steps: CheckStep[]) => steps.every((s) => s.status === 'ok' || s.status === 'warn');

import { isIP } from 'node:net';

/**
 * Network guards for the scraper.
 *
 * These checks look at the URL only. A hostname on the allow-list that
 * resolves to a private address (DNS rebinding) is not caught here, so run the
 * scraper in a container whose egress can't reach the internal network.
 */

function ipv4Private(ip: string): boolean {
  const [a = -1, b = -1] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function ipv6Private(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped?.[1]) return ipv4Private(mapped[1]);
  return /^(fc|fd|fe[89ab])/.test(v);
}

/** Loopback, private, link-local, CGNAT and local-only hostnames. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const kind = isIP(host);
  if (kind === 4) return ipv4Private(host);
  if (kind === 6) return ipv6Private(host);
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    !host.includes('.')
  );
}

export function parseHttpUrl(raw: string): URL | undefined {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : undefined;
  } catch {
    return undefined;
  }
}

/** A document may load only from the extractor's own hosts. */
export function hostAllowed(hosts: string[], raw: string): boolean {
  const u = parseHttpUrl(raw);
  return !!u && hosts.includes(u.hostname) && !isPrivateHost(u.hostname);
}

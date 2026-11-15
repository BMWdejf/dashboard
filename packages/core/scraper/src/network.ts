import { isIP } from 'node:net';

/**
 * Network guards for the scraper.
 *
 * These checks look at the URL only. A hostname on the allow-list that
 * resolves to a private address (DNS rebinding) is not caught here, so run the
 * scraper in a container whose egress can't reach the internal network.
 */

type Octets = [number, number, number, number];

function ipv4Private([a, b]: Octets): boolean {
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) || // IETF protocol assignments
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast and reserved
  );
}

function parseIPv4(ip: string): Octets | undefined {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return undefined;
  }
  return parts as Octets;
}

/** Parse an IPv6 literal (as node:net accepts it) into its eight 16-bit groups. */
function parseIPv6(ip: string): number[] | undefined {
  let s = ip;
  const tail: number[] = [];
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (dotted?.[1]) {
    const v4 = parseIPv4(dotted[1]);
    if (!v4) return undefined;
    tail.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
    s = s.slice(0, -dotted[1].length).replace(/:$/, ':0');
    if (s.endsWith('::0')) s = s.slice(0, -1);
  }
  const halves = s.split('::');
  if (halves.length > 2) return undefined;
  const toGroups = (part: string | undefined) =>
    part ? part.split(':').map((g) => parseInt(g, 16)) : [];
  const head = toGroups(halves[0]);
  const rest = halves.length === 2 ? toGroups(halves[1]) : [];
  const want = 8 - tail.length;
  const groups =
    halves.length === 2
      ? [...head, ...Array<number>(want - head.length - rest.length).fill(0), ...rest]
      : head;
  const all = [...groups.slice(0, want), ...tail];
  if (all.length !== 8 || all.some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff)) {
    return undefined;
  }
  return all;
}

const v4From = (hi: number, lo: number): Octets => [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];

function ipv6Private(g: number[]): boolean {
  const [g0 = 0, g1 = 0, g2 = 0, , , , g6 = 0, g7 = 0] = g;
  // NAT64 64:ff9b::/96 embeds an IPv4; 64:ff9b:1::/48 is local-use. It lies
  // inside ::/8, so check it first.
  if (g0 === 0x0064 && g1 === 0xff9b) return g2 !== 0 || ipv4Private(v4From(g6, g7));
  if (g0 <= 0x00ff) return true; // ::/8: unspecified, loopback, IPv4-mapped/compatible
  if (g0 === 0x2002) return ipv4Private(v4From(g1, g2)); // 6to4
  if (g0 === 0x2001 && g1 === 0x0000) return true; // Teredo
  if ((g0 & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((g0 & 0xffc0) === 0xfe80 || (g0 & 0xffc0) === 0xfec0) return true; // link/site-local
  if ((g0 & 0xff00) === 0xff00) return true; // multicast
  return false;
}

/**
 * Loopback, private, link-local, CGNAT and local-only hostnames, including
 * IPv4 addresses embedded in IPv6 (mapped, NAT64, 6to4). Pass a hostname as
 * `new URL(...).hostname` gives it, which already normalises forms such as
 * `2130706433` or `0x7f.1` to dotted IPv4.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '')
    .toLowerCase();
  const kind = isIP(host);
  if (kind === 4) {
    const v4 = parseIPv4(host);
    return !v4 || ipv4Private(v4);
  }
  if (kind === 6) {
    const v6 = parseIPv6(host.replace(/%.*$/, ''));
    return !v6 || ipv6Private(v6);
  }
  return (
    host === '' ||
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

/**
 * Minimal robots.txt check: groups by User-agent, Allow/Disallow path
 * prefixes with `*` and `$`, longest match wins, Allow wins ties.
 */
interface Rule {
  allow: boolean;
  pattern: RegExp;
  length: number;
}

export interface Robots {
  isAllowed(path: string): boolean;
  crawlDelaySeconds?: number;
}

function toRegExp(path: string): RegExp {
  const anchored = path.endsWith('$');
  const body = (anchored ? path.slice(0, -1) : path)
    .split('*')
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp('^' + body + (anchored ? '$' : ''));
}

export function parseRobots(txt: string, userAgent: string): Robots {
  const ua = userAgent.toLowerCase();
  const groups: { agents: string[]; rules: Rule[]; delay?: number }[] = [];
  let current: (typeof groups)[number] | undefined;
  let lastWasAgent = false;

  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === 'user-agent') {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if ((key === 'allow' || key === 'disallow') && value) {
      current.rules.push({ allow: key === 'allow', pattern: toRegExp(value), length: value.length });
    } else if (key === 'crawl-delay' && Number.isFinite(Number(value))) {
      current.delay = Number(value);
    }
  }

  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && ua.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  const rules = chosen.flatMap((g) => g.rules);
  const delay = chosen.find((g) => g.delay !== undefined)?.delay;

  return {
    crawlDelaySeconds: delay,
    isAllowed(path: string) {
      let best: Rule | undefined;
      for (const r of rules) {
        if (!r.pattern.test(path)) continue;
        if (!best || r.length > best.length || (r.length === best.length && r.allow)) best = r;
      }
      return best ? best.allow : true;
    },
  };
}

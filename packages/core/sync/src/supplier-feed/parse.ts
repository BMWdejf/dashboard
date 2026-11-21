import { SaxesParser } from 'saxes';

import type { FeedRecord } from './mapping';

/** Limits per feed, so a hostile or broken feed can't exhaust memory. */
export const FEED_LIMITS = {
  items: 200_000,
  /** Distinct tags across the feed. */
  tags: 500,
  /** Characters kept of one value. */
  valueLength: 100_000,
  /** Values kept of one tag in one item (e.g. Heureka ACCESSORY). */
  valuesPerTag: 200,
} as const;

interface Frame {
  name: string;
  text: string;
  hasChildren: boolean;
  /** [relative tag, value] collected from the element's descendants. */
  leaves: [string, string][];
}

export class FeedParseError extends Error {
  constructor(
    public readonly code: 'malformed' | 'tooManyItems' | 'noItems',
    public readonly params: Record<string, string | number> = {},
  ) {
    super(code);
    this.name = 'FeedParseError';
  }
}

const lower = (s: string) => s.toLowerCase();

/**
 * Streams the feed and calls `onItem` with each `itemElement` (case
 * insensitive) as a flat record: child elements by path (`DELIVERY/DELIVERY_ID`),
 * attributes of the item as `@name`, and Heureka-style `<PARAM><PARAM_NAME>
 * <VAL>` pairs as `PARAM[name]` (the first spelling of a name wins, so
 * "velikost" and "Velikost" are one tag). Returns the item count.
 */
export async function parseFeedItems(
  chunks: AsyncIterable<string>,
  itemElement: string,
  onItem: (record: FeedRecord) => void,
): Promise<number> {
  const parser = new SaxesParser({ xmlns: false });
  const item = lower(itemElement);
  const paramNames = new Map<string, string>();
  const tags = new Set<string>();
  let stack: Frame[] | null = null;
  let error: FeedParseError | null = null;
  let count = 0;

  const paramLabel = (name: string) => {
    const key = name.trim().toLowerCase();
    if (!paramNames.has(key)) paramNames.set(key, name.trim());
    return paramNames.get(key)!;
  };

  parser.on('error', (e) => {
    error ??= new FeedParseError('malformed', {
      line: parser.line,
      column: parser.column,
      message: e.message.replace(/^.*?:\d+:\d+: /, '').slice(0, 160),
    });
  });
  parser.on('opentag', (tag) => {
    if (stack) {
      stack[stack.length - 1]!.hasChildren = true;
      stack.push({ name: tag.name, text: '', hasChildren: false, leaves: [] });
    } else if (lower(tag.name) === item) {
      const leaves = Object.entries(tag.attributes).map(([k, v]) => [`@${k}`, String(v)] as [string, string]);
      stack = [{ name: tag.name, text: '', hasChildren: false, leaves }];
    }
    if (tag.isSelfClosing) close();
  });
  const onText = (t: string) => {
    const top = stack?.[stack.length - 1];
    if (top && top.text.length < FEED_LIMITS.valueLength) top.text += t;
  };
  parser.on('text', onText);
  parser.on('cdata', onText);
  parser.on('closetag', (tag) => {
    if (!tag.isSelfClosing) close();
  });

  function close() {
    if (!stack) return;
    const frame = stack.pop()!;
    if (stack.length === 0) {
      stack = null;
      emit(frame);
      return;
    }
    const parent = stack[stack.length - 1]!;
    if (!frame.hasChildren) {
      parent.leaves.push([frame.name, frame.text.slice(0, FEED_LIMITS.valueLength)]);
      return;
    }
    if (lower(frame.name) === 'param') {
      const name = frame.leaves.find(([k]) => lower(k) === 'param_name')?.[1];
      const val = frame.leaves.find(([k]) => lower(k) === 'val' || lower(k) === 'value')?.[1];
      if (name?.trim() && val !== undefined) {
        parent.leaves.push([`PARAM[${paramLabel(name)}]`, val]);
        return;
      }
    }
    for (const [k, v] of frame.leaves) parent.leaves.push([`${frame.name}/${k}`, v]);
  }

  function emit(frame: Frame) {
    count++;
    if (count > FEED_LIMITS.items) {
      error ??= new FeedParseError('tooManyItems', { max: FEED_LIMITS.items });
      return;
    }
    const record: FeedRecord = {};
    for (const [tag, value] of frame.leaves) {
      if (!record[tag]) {
        if (!tags.has(tag)) {
          if (tags.size >= FEED_LIMITS.tags) continue;
          tags.add(tag);
        }
        record[tag] = [];
      }
      if (record[tag]!.length < FEED_LIMITS.valuesPerTag) record[tag]!.push(value);
    }
    onItem(record);
  }

  for await (const chunk of chunks) {
    parser.write(chunk);
    if (error) throw error;
  }
  parser.close();
  if (error) throw error;
  if (count === 0) throw new FeedParseError('noItems');
  return count;
}

export interface FeedTagSummary {
  tag: string;
  /** Items that have the tag. */
  items: number;
  /** First non-empty value, shortened, for the mapping screen. */
  sample: string;
}

/** Collects tags in first-seen order with a sample value; feed records to `add`. */
export function tagCollector() {
  const tags = new Map<string, FeedTagSummary>();
  return {
    add(record: FeedRecord) {
      for (const [tag, values] of Object.entries(record)) {
        let t = tags.get(tag);
        if (!t) tags.set(tag, (t = { tag, items: 0, sample: '' }));
        t.items++;
        if (!t.sample) {
          const v = values.find((x) => x.trim() !== '');
          if (v) t.sample = sampleText(v);
        }
      }
    },
    list: () => [...tags.values()],
  };
}

/** HTML stripped, whitespace collapsed, at most 120 characters. */
export function sampleText(value: string): string {
  const s = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}

import {
  filterField,
  REF_NONE,
  withFilters,
  type ProductFilter,
} from '@repo/core-db/product-filters';

import type { Dictionary } from '../../lib/i18n';
import type { FilterChoices } from './ProductFilters';

type Labels = Dictionary['products']['filters'];

/** Text of an active filter's chip, e.g. "Cena s DPH: 100 – 500". */
export function describeFilter(
  f: ProductFilter,
  labels: Labels,
  choices: FilterChoices,
  fmt: { number: (n: number) => string; day: (day: string) => string },
): string {
  const name = labels.fields[f.key];
  const range = (a: string | null, b: string | null) =>
    a && b ? `${name}: ${a} – ${b}` : a ? `${name}: ≥ ${a}` : `${name}: ≤ ${b}`;
  switch (f.kind) {
    case 'text':
      return f.op === 'empty' || f.op === 'notEmpty'
        ? `${name} ${labels.ops[f.op]}`
        : `${name} ${labels.ops[f.op]} „${f.value}“`;
    case 'number':
      return range(f.min === null ? null : fmt.number(f.min), f.max === null ? null : fmt.number(f.max));
    case 'date':
      return range(f.from && fmt.day(f.from), f.to && fmt.day(f.to));
    case 'bool':
      return `${name}: ${f.value ? labels.yes : labels.no}`;
    default: {
      const field = filterField(f.key)!;
      const label = (v: string): string => {
        if (field.kind === 'enum') return (labels.options[field.key] as Record<string, string>)[v] ?? v;
        if (field.kind === 'ref') {
          if (v === REF_NONE) return labels.none;
          return choices[field.source].find((c) => c.id === v)?.label ?? v;
        }
        return v;
      };
      return `${name}: ${f.values.map(label).join(', ')}`;
    }
  }
}

/** Link to the products list with `filters` (page 1, other params kept). */
export function filtersHref(params: URLSearchParams, filters: readonly ProductFilter[]): string {
  const next = withFilters(params, filters);
  next.delete('page');
  const qs = next.toString();
  return qs ? `/products?${qs}` : '/products';
}

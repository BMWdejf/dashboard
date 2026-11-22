'use client';

import {
  decodeFilter,
  FILTER_GROUPS,
  filterField,
  PRODUCT_FILTER_FIELDS,
  REF_NONE,
  TEXT_OPS,
  withFilters,
  type ProductFilter,
  type ProductFilterField,
  type ProductFilterKey,
  type TextOp,
} from '@repo/core-db/product-filters';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId, useRef, useState, useTransition } from 'react';

import type { Dictionary } from '../../lib/i18n';
import dash from '../dashboard/dashboard.module.css';
import styles from './products.module.css';

type Labels = Dictionary['products']['filters'];

export interface FilterChoice {
  id: string;
  label: string;
}

export interface FilterChoices {
  groups: FilterChoice[];
  units: FilterChoice[];
  tags: string[];
}

/** A condition being edited; turned into a URL value with toRaw(). */
interface Draft {
  key: ProductFilterKey;
  op: TextOp;
  a: string;
  b: string;
  values: string[];
}

function toDraft(f: ProductFilter): Draft {
  const d: Draft = { key: f.key, op: 'contains', a: '', b: '', values: [] };
  switch (f.kind) {
    case 'text':
      return { ...d, op: f.op, a: f.value };
    case 'number':
      return { ...d, a: f.min === null ? '' : String(f.min), b: f.max === null ? '' : String(f.max) };
    case 'date':
      return { ...d, a: f.from ?? '', b: f.to ?? '' };
    case 'bool':
      return { ...d, a: String(f.value) };
    default:
      return { ...d, values: f.values };
  }
}

function newDraft(field: ProductFilterField): Draft {
  return { key: field.key, op: 'contains', a: field.kind === 'bool' ? 'true' : '', b: '', values: [] };
}

function toRaw(d: Draft): string {
  const field = filterField(d.key)!;
  switch (field.kind) {
    case 'text':
      return d.op === 'empty' || d.op === 'notEmpty' ? d.op : `${d.op}:${d.a}`;
    case 'number':
    case 'date':
      return `${d.a}..${d.b}`;
    case 'bool':
      return d.a;
    default:
      return d.values.join(',');
  }
}

const parse = (d: Draft) => decodeFilter(d.key, toRaw(d));

/**
 * The "Filtr" button in the table head and its side panel (a modal <dialog>:
 * focus stays inside, Escape closes it). Conditions over any column of the
 * Flexi product mirror are edited as drafts; "Použít" writes them to the URL
 * (`f.<key>=…`), keeping the search and page size and going back to page 1.
 */
export function ProductFilters({
  filters,
  choices,
  labels,
}: {
  filters: ProductFilter[];
  choices: FilterChoices;
  labels: Labels;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const dialog = useRef<HTMLDialogElement>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [pending, startTransition] = useTransition();
  const titleId = useId();

  const open = () => {
    setDrafts(filters.map(toDraft));
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();

  const go = (next: readonly ProductFilter[]) => {
    const p = withFilters(new URLSearchParams(params.toString()), next);
    p.delete('page');
    const qs = p.toString();
    close();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const used = new Set(drafts.map((d) => d.key));
  const update = (i: number, patch: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const incomplete = drafts.some((d) => !parse(d));

  return (
    <>
      <button
        type="button"
        className={`${styles.filterButton} ${filters.length ? styles.filterButtonActive : ''}`}
        aria-haspopup="dialog"
        aria-busy={pending}
        onClick={open}
      >
        <span className={styles.filterIcon} aria-hidden />
        {filters.length ? labels.buttonActive.replace('{n}', String(filters.length)) : labels.button}
      </button>

      <dialog
        ref={dialog}
        className={styles.filterDialog}
        aria-labelledby={titleId}
        onClick={(e) => {
          // A click on the backdrop (outside the panel) closes it.
          if (e.target === dialog.current) close();
        }}
      >
        <form
          className={styles.filterPanel}
          onSubmit={(e) => {
            e.preventDefault();
            go(drafts.map(parse).filter((f): f is ProductFilter => f !== null));
          }}
        >
          <header className={styles.filterPanelHead}>
            <div>
              <h2 id={titleId}>{labels.title}</h2>
              <p>{labels.intro}</p>
            </div>
            <button type="button" className={styles.filterClose} onClick={close} aria-label={labels.close} title={labels.close}>
              <span aria-hidden>×</span>
            </button>
          </header>

          <div className={styles.filterRows}>
            {drafts.length === 0 && <p className={styles.filterEmpty}>{labels.empty}</p>}
            {drafts.map((d, i) => (
              <DraftRow
                key={d.key}
                draft={d}
                choices={choices}
                labels={labels}
                onChange={(patch) => update(i, patch)}
                onRemove={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}
              />
            ))}

            <label className={styles.filterAdd}>
              <span className={dash.visuallyHidden}>{labels.add}</span>
              <select
                value=""
                onChange={(e) => {
                  const field = filterField(e.target.value);
                  if (field) setDrafts((ds) => [...ds, newDraft(field)]);
                }}
              >
                <option value="">{labels.add}</option>
                {FILTER_GROUPS.map((g) => (
                  <optgroup key={g} label={labels.groups[g]}>
                    {PRODUCT_FILTER_FIELDS.filter((f) => f.group === g && !used.has(f.key)).map((f) => (
                      <option key={f.key} value={f.key}>
                        {labels.fields[f.key]}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>

          <footer className={styles.filterPanelFoot}>
            {incomplete && <p className={styles.filterHint}>{labels.incomplete}</p>}
            <button type="button" className={styles.filterSecondary} onClick={() => go([])}>
              {labels.clearAll}
            </button>
            <button type="submit" className={styles.cta}>
              {labels.apply}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}

function DraftRow({
  draft: d,
  choices,
  labels,
  onChange,
  onRemove,
}: {
  draft: Draft;
  choices: FilterChoices;
  labels: Labels;
  onChange: (patch: Partial<Draft>) => void;
  onRemove: () => void;
}) {
  const field = filterField(d.key)!;
  const name = labels.fields[d.key];
  const id = useId();
  const invalid = !parse(d);

  let editor: React.ReactNode;
  switch (field.kind) {
    case 'text':
      editor = (
        <div className={styles.filterInline}>
          <select aria-label={`${name}: ${labels.ops[d.op]}`} value={d.op} onChange={(e) => onChange({ op: e.target.value as TextOp })}>
            {TEXT_OPS.map((op) => (
              <option key={op} value={op}>
                {labels.ops[op]}
              </option>
            ))}
          </select>
          {(d.op === 'contains' || d.op === 'equals') && (
            <input aria-labelledby={id} value={d.a} maxLength={100} onChange={(e) => onChange({ a: e.target.value })} />
          )}
        </div>
      );
      break;
    case 'number':
    case 'date':
      editor = (
        <div className={styles.filterInline}>
          {(['a', 'b'] as const).map((side) => (
            <label key={side} className={styles.filterRange}>
              <span>{side === 'a' ? labels.from : labels.to}</span>
              <input
                type={field.kind === 'date' ? 'date' : 'text'}
                inputMode={field.kind === 'number' ? 'decimal' : undefined}
                value={d[side]}
                onChange={(e) => onChange({ [side]: e.target.value })}
              />
            </label>
          ))}
        </div>
      );
      break;
    case 'bool':
      editor = (
        <div className={styles.filterInline} role="radiogroup" aria-labelledby={id}>
          {(['true', 'false'] as const).map((v) => (
            <label key={v} className={styles.filterRadio}>
              <input type="radio" name={`${id}-bool`} checked={d.a === v} onChange={() => onChange({ a: v })} />
              {v === 'true' ? labels.yes : labels.no}
            </label>
          ))}
        </div>
      );
      break;
    default: {
      const items: FilterChoice[] =
        field.kind === 'enum'
          ? field.options.map((v) => ({ id: v, label: (labels.options[field.key] as Record<string, string>)[v] ?? v }))
          : field.kind === 'ref'
            ? [{ id: REF_NONE, label: labels.none }, ...choices[field.source]]
            : choices.tags.map((t) => ({ id: t, label: t }));
      editor = (
        <CheckList
          items={items}
          selected={d.values}
          labels={labels}
          labelledBy={id}
          onChange={(values) => onChange({ values })}
        />
      );
    }
  }

  return (
    <fieldset className={`${styles.filterRow} ${invalid ? styles.filterRowIncomplete : ''}`}>
      <div className={styles.filterRowHead}>
        <legend id={id}>{name}</legend>
        <button
          type="button"
          className={styles.filterRemove}
          onClick={onRemove}
          aria-label={labels.remove.replace('{field}', name)}
          title={labels.remove.replace('{field}', name)}
        >
          <span aria-hidden>×</span>
        </button>
      </div>
      {editor}
    </fieldset>
  );
}

/** Checkboxes (any of them matches); with a search box when the list is long. */
function CheckList({
  items,
  selected,
  labels,
  labelledBy,
  onChange,
}: {
  items: FilterChoice[];
  selected: string[];
  labels: Labels;
  labelledBy: string;
  onChange: (values: string[]) => void;
}) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLocaleLowerCase();
  const shown = needle ? items.filter((i) => i.label.toLocaleLowerCase().includes(needle)) : items;
  const toggle = (v: string, on: boolean) =>
    onChange(on ? [...selected, v] : selected.filter((x) => x !== v));

  return (
    <div className={styles.filterChecks}>
      {items.length > 8 && (
        <input
          type="search"
          className={styles.filterChecksSearch}
          placeholder={labels.search}
          aria-label={labels.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}
      <div className={styles.filterChecksList} role="group" aria-labelledby={labelledBy}>
        {shown.length === 0 && <p className={styles.filterEmpty}>{labels.noOptions}</p>}
        {shown.map((i) => (
          <label key={i.id} className={styles.filterCheck}>
            <input type="checkbox" checked={selected.includes(i.id)} onChange={(e) => toggle(i.id, e.target.checked)} />
            <span>{i.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

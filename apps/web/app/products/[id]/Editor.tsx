'use client';

import {
  SHOPTET_FIELDS,
  shoptetOutput,
  type ShoptetField,
  type ShoptetSettings,
} from '@repo/core-db/shoptet';
import type { Locale } from '@repo/core-db/settings';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';

import type { Dictionary } from '../../../lib/i18n';
import { formatters } from '../../dashboard/format';
import { saveProduct, syncProduct, type ActionResult } from './actions';
import d from './detail.module.css';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface FlexiFields {
  nazev: string;
  nakupCena: string;
  /** Base price in the product's price type (typCenyDph). */
  cenaZakl: string;
  typSazbyDph: string;
  skupinaKod: string;
  exportNaEshop: boolean;
}

export interface EditorData {
  cenikId: string;
  kod: string;
  locale: Locale;
  flexi: FlexiFields;
  /** Which price Flexi takes: without (bezDph) or with (sDph) VAT. */
  typCenyDph: 'bezDph' | 'sDph';
  /** Current VAT percentage, for the derived price while the rate is unchanged. */
  szbDph: number | null;
  priceNet: string | null;
  priceGross: string | null;
  stock: string;
  available: string;
  unit: string;
  skladove: boolean;
  groups: { kod: string; nazev: string | null }[];
  shoptet: ShoptetSettings;
}

type Labels = Dictionary['products']['detail'];

interface EditorState {
  data: EditorData;
  t: Labels;
  flexi: FlexiFields;
  setFlexi: (patch: Partial<FlexiFields>) => void;
  shoptet: ShoptetSettings;
  setOverride: (field: ShoptetField, value: string | undefined) => void;
  setShoptet: (patch: Partial<Omit<ShoptetSettings, 'overrides'>>) => void;
  flexiChanges: Partial<FlexiFields>;
  shoptetDirty: boolean;
  dirtyCount: number;
  discard: () => void;
  save: () => void;
  sync: () => void;
  pending: 'save' | 'sync' | null;
  status: ActionResult | null;
  rulesOpen: boolean;
  setRulesOpen: (open: boolean) => void;
  fmt: ReturnType<typeof formatters>;
  groupName: (kod: string) => string | null;
}

const Ctx = createContext<EditorState | null>(null);

function useEditor(): EditorState {
  const s = useContext(Ctx);
  if (!s) throw new Error('Editor components must be inside <ProductEditor>.');
  return s;
}

const FLEXI_KEYS = [
  'nazev',
  'nakupCena',
  'cenaZakl',
  'typSazbyDph',
  'skupinaKod',
  'exportNaEshop',
] as const;

const sameShoptet = (a: ShoptetSettings, b: ShoptetSettings) =>
  a.stockAutoSync === b.stockAutoSync &&
  Number(a.safetyBuffer) === Number(b.safetyBuffer) &&
  SHOPTET_FIELDS.every(
    (f) => (a.overrides[f] ?? '') === (b.overrides[f] ?? ''),
  );

/** Holds the drafts of the product detail; children place the controls. */
export function ProductEditor({
  data,
  t,
  children,
}: {
  data: EditorData;
  t: Labels;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [flexi, setFlexiState] = useState(data.flexi);
  const [shoptet, setShoptetState] = useState(data.shoptet);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState<'save' | 'sync' | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [, startTransition] = useTransition();
  const fmt = formatters(data.locale);

  // New data from the server (after a save or a sync): fields the user didn't
  // touch follow it; edited fields keep the user's value.
  const prev = useRef(data);
  useEffect(() => {
    const old = prev.current;
    prev.current = data;
    setFlexiState((draft) => {
      const next = { ...draft };
      for (const k of FLEXI_KEYS)
        if (draft[k] === old.flexi[k])
          (next as Record<string, unknown>)[k] = data.flexi[k];
      return next;
    });
    setShoptetState((draft) =>
      sameShoptet(draft, old.shoptet) ? data.shoptet : draft,
    );
  }, [data]);

  const flexiChanges: Partial<FlexiFields> = {};
  for (const k of FLEXI_KEYS) {
    if (flexi[k] !== data.flexi[k])
      (flexiChanges as Record<string, unknown>)[k] = flexi[k];
  }
  const shoptetDirty = !sameShoptet(shoptet, data.shoptet);
  const dirtyCount =
    Object.keys(flexiChanges).length +
    (shoptetDirty
      ? SHOPTET_FIELDS.filter(
          (f) =>
            (shoptet.overrides[f] ?? '') !== (data.shoptet.overrides[f] ?? ''),
        ).length +
        (shoptet.stockAutoSync !== data.shoptet.stockAutoSync ? 1 : 0) +
        (Number(shoptet.safetyBuffer) !== Number(data.shoptet.safetyBuffer)
          ? 1
          : 0)
      : 0);

  function run(kind: 'save' | 'sync', action: () => Promise<ActionResult>) {
    setPending(kind);
    setStatus(null);
    startTransition(async () => {
      try {
        const r = await action();
        setStatus(r);
        if (r.ok) router.refresh();
      } catch {
        setStatus({ ok: false, tone: 'error', messages: [t.edit.failed] });
      } finally {
        setPending(null);
      }
    });
  }

  const state: EditorState = {
    data,
    t,
    flexi,
    setFlexi: (patch) => setFlexiState((f) => ({ ...f, ...patch })),
    shoptet,
    setOverride: (field, value) =>
      setShoptetState((s) => {
        const overrides = { ...s.overrides };
        if (value === undefined) delete overrides[field];
        else overrides[field] = value;
        return { ...s, overrides };
      }),
    setShoptet: (patch) => setShoptetState((s) => ({ ...s, ...patch })),
    flexiChanges,
    shoptetDirty,
    dirtyCount,
    discard: () => {
      setFlexiState(data.flexi);
      setShoptetState(data.shoptet);
      setStatus(null);
    },
    save: () =>
      run('save', () =>
        saveProduct({
          cenikId: data.cenikId,
          flexi: Object.keys(flexiChanges).length
            ? {
                ...flexiChanges,
                ...('skupinaKod' in flexiChanges
                  ? { skupinaKod: flexiChanges.skupinaKod || null }
                  : {}),
              }
            : undefined,
          shoptet: shoptetDirty ? shoptet : undefined,
        }),
      ),
    sync: () => run('sync', () => syncProduct(data.cenikId)),
    pending,
    status,
    rulesOpen,
    setRulesOpen,
    fmt,
    groupName: (kod) => {
      const g = data.groups.find((x) => x.kod === kod);
      return g ? (g.nazev ?? g.kod) : null;
    },
  };

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

// ---------------------------------------------------------------------------
// Header actions and status
// ---------------------------------------------------------------------------

export function HeaderActions() {
  const s = useEditor();
  const { t } = s;
  return (
    <div className={d.actions}>
      {s.dirtyCount > 0 && (
        <button
          type="button"
          className={d.btnText}
          onClick={s.discard}
          disabled={s.pending !== null}
        >
          {t.edit.discard}
        </button>
      )}
      <button
        type="button"
        className={d.btnSecondary}
        onClick={s.sync}
        disabled={s.pending !== null}
        aria-busy={s.pending === 'sync'}
      >
        <span
          className={`${d.iconSync} ${s.pending === 'sync' ? d.spin : ''}`}
          aria-hidden
        />
        {s.pending === 'sync' ? t.edit.syncing : t.forceSync}
      </button>
      <button
        type="button"
        className={d.btnPrimary}
        onClick={s.save}
        disabled={s.pending !== null || s.dirtyCount === 0}
        aria-busy={s.pending === 'save'}
        title={s.dirtyCount === 0 ? t.edit.noChanges : undefined}
      >
        <span className={d.iconSave} aria-hidden />
        {s.pending === 'save' ? t.edit.saving : t.savePush}
        {s.dirtyCount > 0 && s.pending === null && (
          <span className={d.countBadge}>{s.dirtyCount}</span>
        )}
      </button>
    </div>
  );
}

export function StatusBar() {
  const s = useEditor();
  const st = s.status;
  return (
    <div className={d.statusSlot} role="status" aria-live="polite">
      {st && st.messages.length > 0 && (
        <div className={`${d.statusBar} ${d[`status_${st.tone}`]}`}>
          <p>{st.messages[0]}</p>
          {st.messages.length > 1 && (
            <ul>
              {st.messages.slice(1).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!st && s.dirtyCount > 0 && (
        <div className={`${d.statusBar} ${d.status_info}`}>
          <p>{s.t.edit.unsaved.replace('{n}', String(s.dirtyCount))}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggles
// ---------------------------------------------------------------------------

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={d.toggle}
      onClick={() => onChange(!checked)}
    />
  );
}

/** Shoptet connector: "Export na e-shop" is a Flexi field (exportNaEshop). */
export function ExportToggle() {
  const s = useEditor();
  return (
    <span className={d.inlineSwitch}>
      {s.flexi.exportNaEshop ? s.t.yes : s.t.no}
      <Switch
        checked={s.flexi.exportNaEshop}
        onChange={(v) => s.setFlexi({ exportNaEshop: v })}
        label={s.t.exportToggle}
      />
    </span>
  );
}

function useStockOut() {
  const s = useEditor();
  return shoptetOutput(
    {
      title: s.flexi.nazev,
      priceGross: s.data.priceGross,
      available: s.data.available,
      category: s.groupName(s.flexi.skupinaKod),
    },
    s.shoptet,
  ).stock;
}

/** Stock card row (design: "Published on Shoptet"): what goes to the e-shop now. */
export function PublishedLine() {
  const s = useEditor();
  const stock = useStockOut();
  return (
    <div className={d.line}>
      <dt>{s.t.edit.published}</dt>
      <dd className={d.lineStrong}>
        {stock.value === null
          ? s.t.edit.notSent
          : `${s.fmt.qty(stock.value)} ${s.data.unit}`.trim()}
      </dd>
    </div>
  );
}

/** Stock card box: auto-sync of the stock level to Shoptet and the safety buffer. */
export function StockRules() {
  const s = useEditor();
  const { t } = s;
  return (
    <div className={d.ruleBox}>
      <div className={d.toggleRow}>
        <span>{t.edit.autoStock}</span>
        <Switch
          checked={s.shoptet.stockAutoSync}
          onChange={(v) => s.setShoptet({ stockAutoSync: v })}
          label={t.edit.autoStock}
        />
      </div>
      <label className={d.ruleLine}>
        {t.edit.buffer}:
        <input
          className={d.miniInput}
          type="text"
          inputMode="decimal"
          value={s.shoptet.safetyBuffer}
          onChange={(e) => s.setShoptet({ safetyBuffer: e.target.value })}
          aria-label={t.edit.buffer}
        />
        {s.data.unit}
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mapping table
// ---------------------------------------------------------------------------

type Row = {
  key: string;
  label: string;
  type: string;
  flexi: React.ReactNode;
  /** Plain text of the Flexi and Shoptet cells, for the CSV export. */
  flexiText: string;
  rule: { text: string; tone: 'accent' | 'idle' | 'own' };
  shoptet: React.ReactNode;
  shoptetText: string;
  status: { text: string; tone: 'own' | 'flexi' | 'idle' };
};

export function MappingHeadActions() {
  const s = useEditor();
  const { t } = s;
  const hasOverrides = Object.keys(s.shoptet.overrides).length > 0;
  return (
    <div className={d.mappingActions}>
      <button
        type="button"
        className={d.btnSmall}
        onClick={() => s.setRulesOpen(true)}
        aria-haspopup="dialog"
      >
        {t.rulesConfig}
      </button>
      <button
        type="button"
        className={d.btnSmallAccent}
        onClick={() => {
          if (!hasOverrides) {
            window.alert(t.edit.resolveNothing);
            return;
          }
          if (window.confirm(t.edit.resolveConfirm))
            for (const f of SHOPTET_FIELDS) s.setOverride(f, undefined);
        }}
      >
        {t.autoResolve}
      </button>
      <RulesDialog />
    </div>
  );
}

function RulesDialog() {
  const s = useEditor();
  const { t } = s;
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (s.rulesOpen && !el.open) el.showModal();
    if (!s.rulesOpen && el.open) el.close();
  }, [s.rulesOpen]);
  const flexiValue: Record<ShoptetField, string> = {
    title: s.flexi.nazev,
    priceGross: s.data.priceGross ?? '0',
    stock: s.data.available,
    category: s.groupName(s.flexi.skupinaKod) ?? '',
  };
  const names: Record<ShoptetField, string> = {
    title: t.rowTitle,
    priceGross: t.rowPriceGross,
    stock: t.rowStock,
    category: t.rowCategory,
  };
  return (
    <dialog
      ref={ref}
      className={d.dialog}
      onClose={() => s.setRulesOpen(false)}
      aria-labelledby="rules-title"
    >
      <h2 id="rules-title">{t.edit.rulesTitle}</h2>
      <p>{t.edit.rulesIntro}</p>
      <ul className={d.rulesList}>
        {SHOPTET_FIELDS.map((f) => (
          <li key={f}>
            <span>{names[f]}</span>
            <select
              value={s.shoptet.overrides[f] !== undefined ? 'own' : 'flexi'}
              onChange={(e) =>
                s.setOverride(
                  f,
                  e.target.value === 'own' ? flexiValue[f] : undefined,
                )
              }
              aria-label={names[f]}
            >
              <option value="flexi">
                {f === 'stock' ? t.edit.ruleAuto : t.edit.ruleFlexi}
              </option>
              <option value="own">{t.edit.ruleOwn}</option>
            </select>
          </li>
        ))}
      </ul>
      <form method="dialog">
        <button className={d.btnPrimary} type="submit">
          {t.edit.close}
        </button>
      </form>
    </dialog>
  );
}

export function MappingTable() {
  const s = useEditor();
  const { t, data, fmt } = s;
  const te = t.edit;
  const czk = (v: string | null) =>
    fmt.czk(
      v === null || v === '' || Number.isNaN(Number(v))
        ? null
        : v.replace(',', '.'),
    );
  const out = shoptetOutput(
    {
      title: s.flexi.nazev,
      priceGross: data.priceGross,
      available: data.available,
      category: s.groupName(s.flexi.skupinaKod),
    },
    s.shoptet,
  );

  // The price Flexi takes is editable; the other one is derived (with the
  // current VAT rate while the rate is unchanged).
  const rateUnchanged =
    s.flexi.typSazbyDph === data.flexi.typSazbyDph && data.szbDph !== null;
  const base = Number(s.flexi.cenaZakl.replace(',', '.'));
  const derived = (toGross: boolean) =>
    !rateUnchanged || Number.isNaN(base)
      ? null
      : String(
          Math.round(
            (toGross
              ? base * (1 + data.szbDph! / 100)
              : base / (1 + data.szbDph! / 100)) * 100,
          ) / 100,
        );
  const netEditable = data.typCenyDph === 'bezDph';
  const priceInput = (label: string) => (
    <input
      className={d.cellInput}
      inputMode="decimal"
      value={s.flexi.cenaZakl}
      onChange={(e) => s.setFlexi({ cenaZakl: e.target.value })}
      aria-label={label}
      title={netEditable ? te.priceBaseNet : te.priceBaseGross}
    />
  );
  const own = (
    field: ShoptetField,
    label: string,
    placeholder: string,
    numeric = false,
  ) => (
    <input
      className={`${d.cellInput} ${out[field].overridden ? d.cellOverride : ''}`}
      inputMode={numeric ? 'decimal' : undefined}
      value={s.shoptet.overrides[field] ?? ''}
      placeholder={placeholder}
      onChange={(e) =>
        s.setOverride(field, e.target.value === '' ? undefined : e.target.value)
      }
      aria-label={`${t.colShoptet}: ${label}`}
    />
  );
  const status = (field: ShoptetField): Row['status'] =>
    out[field].overridden
      ? { text: te.overrideActive, tone: 'own' }
      : out[field].value === null
        ? { text: te.notSent, tone: 'idle' }
        : { text: te.fromFlexi, tone: 'flexi' };
  const rule = (field: ShoptetField, auto = false): Row['rule'] =>
    out[field].overridden
      ? { text: te.ruleOwn, tone: 'own' }
      : { text: auto ? te.ruleAuto : te.ruleFlexi, tone: 'accent' };
  const readOnly = (text: string) => (
    <span className={d.muted}>
      {text} <span className={d.roTag}>{te.readOnly}</span>
    </span>
  );

  const vatName =
    te.vatRates[s.flexi.typSazbyDph as keyof typeof te.vatRates] ??
    s.flexi.typSazbyDph;
  const vatText =
    rateUnchanged && data.szbDph !== null
      ? `${vatName} (${fmt.share(data.szbDph)})`
      : vatName;

  const rows: Row[] = [
    {
      key: 'title',
      label: t.rowTitle,
      type: t.typeString,
      flexi: (
        <input
          className={d.cellInput}
          value={s.flexi.nazev}
          maxLength={255}
          onChange={(e) => s.setFlexi({ nazev: e.target.value })}
          aria-label={`${t.colFlexi}: ${t.rowTitle}`}
        />
      ),
      flexiText: s.flexi.nazev,
      rule: rule('title'),
      shoptet: own('title', t.rowTitle, s.flexi.nazev),
      shoptetText: out.title.value ?? '',
      status: status('title'),
    },
    {
      key: 'purchase',
      label: t.rowPurchase,
      type: 'CZK',
      flexi: (
        <input
          className={d.cellInput}
          inputMode="decimal"
          value={s.flexi.nakupCena}
          onChange={(e) => s.setFlexi({ nakupCena: e.target.value })}
          aria-label={`${t.colFlexi}: ${t.rowPurchase}`}
        />
      ),
      flexiText: czk(s.flexi.nakupCena),
      rule: { text: te.ruleFlexiOnly, tone: 'idle' },
      shoptet: readOnly(czk(s.flexi.nakupCena)),
      shoptetText: czk(s.flexi.nakupCena),
      status: { text: te.fromFlexi, tone: 'flexi' },
    },
    {
      key: 'net',
      label: t.rowPriceNet,
      type: 'CZK',
      flexi: netEditable ? (
        priceInput(`${t.colFlexi}: ${t.rowPriceNet}`)
      ) : (
        <span title={te.priceBaseGross}>
          {czk(derived(false) ?? data.priceNet)}
        </span>
      ),
      flexiText: czk(
        netEditable ? s.flexi.cenaZakl : (derived(false) ?? data.priceNet),
      ),
      rule: { text: te.ruleFlexiOnly, tone: 'idle' },
      shoptet: readOnly(
        czk(netEditable ? s.flexi.cenaZakl : (derived(false) ?? data.priceNet)),
      ),
      shoptetText: czk(
        netEditable ? s.flexi.cenaZakl : (derived(false) ?? data.priceNet),
      ),
      status: { text: te.fromFlexi, tone: 'flexi' },
    },
    {
      key: 'gross',
      label: t.rowPriceGross,
      type: 'B2C',
      flexi: !netEditable ? (
        priceInput(`${t.colFlexi}: ${t.rowPriceGross}`)
      ) : (
        <span title={te.priceBaseNet}>
          {czk(derived(true) ?? data.priceGross)}
        </span>
      ),
      flexiText: czk(
        !netEditable ? s.flexi.cenaZakl : (derived(true) ?? data.priceGross),
      ),
      rule: rule('priceGross'),
      shoptet: own('priceGross', t.rowPriceGross, czk(data.priceGross), true),
      shoptetText: czk(out.priceGross.value),
      status: status('priceGross'),
    },
    {
      key: 'vat',
      label: t.rowVat,
      type: t.typeTax,
      flexi: (
        <select
          className={d.cellInput}
          value={s.flexi.typSazbyDph}
          onChange={(e) => s.setFlexi({ typSazbyDph: e.target.value })}
          aria-label={`${t.colFlexi}: ${t.rowVat}`}
        >
          {(Object.keys(te.vatRates) as (keyof typeof te.vatRates)[]).map(
            (k) => (
              <option key={k} value={k}>
                {te.vatRates[k]}
                {k === data.flexi.typSazbyDph && data.szbDph !== null
                  ? ` (${fmt.share(data.szbDph)})`
                  : ''}
              </option>
            ),
          )}
        </select>
      ),
      flexiText: vatText,
      rule: { text: te.ruleFlexiOnly, tone: 'idle' },
      shoptetText: vatText,
      shoptet: readOnly(
        rateUnchanged && data.szbDph !== null
          ? fmt.share(data.szbDph)
          : (te.vatRates[s.flexi.typSazbyDph as keyof typeof te.vatRates] ??
              '—'),
      ),
      status: { text: te.fromFlexi, tone: 'flexi' },
    },
    {
      key: 'stock',
      label: t.rowStock,
      type: t.typeCount,
      flexi: (
        <span title={te.stockReadOnly}>
          {data.skladove ? `${fmt.qty(data.stock)} ${data.unit}`.trim() : '—'}{' '}
          <span className={d.roTag}>{te.readOnly}</span>
        </span>
      ),
      flexiText: data.skladove
        ? `${fmt.qty(data.stock)} ${data.unit}`.trim()
        : '—',
      rule: rule('stock', true),
      shoptetText:
        out.stock.value === null
          ? te.notSent
          : `${fmt.qty(out.stock.value)} ${data.unit}`.trim(),
      shoptet: own(
        'stock',
        t.rowStock,
        out.stock.overridden
          ? ''
          : out.stock.value === null
            ? te.notSent
            : fmt.qty(out.stock.value),
        true,
      ),
      status: status('stock'),
    },
    {
      key: 'category',
      label: t.rowCategory,
      type: t.typePath,
      flexi: (
        <select
          className={d.cellInput}
          value={s.flexi.skupinaKod}
          onChange={(e) => s.setFlexi({ skupinaKod: e.target.value })}
          aria-label={`${t.colFlexi}: ${t.rowCategory}`}
        >
          <option value="">{te.noGroupOption}</option>
          {data.groups.map((g) => (
            <option key={g.kod} value={g.kod}>
              {g.nazev ?? g.kod}
            </option>
          ))}
        </select>
      ),
      flexiText: s.groupName(s.flexi.skupinaKod) ?? '—',
      rule: rule('category'),
      shoptet: own(
        'category',
        t.rowCategory,
        s.groupName(s.flexi.skupinaKod) ?? '',
      ),
      shoptetText: out.category.value ?? '—',
      status: status('category'),
    },
  ];

  return (
    <>
      <div className={d.mappingWrap}>
        <table className={d.mapping}>
          <thead>
            <tr>
              <th scope="col">{t.colAttribute}</th>
              <th scope="col">{t.colFeed}</th>
              <th scope="col">{t.colFlexi}</th>
              <th scope="col">{t.colRule}</th>
              <th scope="col">{t.colShoptet}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.key}
                className={
                  r.key in s.flexiChanges ||
                  (r.key === 'title' && 'nazev' in s.flexiChanges)
                    ? d.rowDirty
                    : undefined
                }
              >
                <th scope="row">
                  <span className={d.attr}>{r.label}</span>
                  <span className={d.typeTag}>{r.type}</span>
                </th>
                <td className={d.muted}>—</td>
                <td className={d.flexiValue}>{r.flexi}</td>
                <td>
                  <span
                    className={
                      r.rule.tone === 'own'
                        ? d.ownPill
                        : r.rule.tone === 'accent'
                          ? d.rulePill
                          : d.pillIdle
                    }
                  >
                    {r.rule.text}
                  </span>
                </td>
                <td>
                  <div className={d.outCell}>
                    {r.shoptet}
                    <span
                      className={
                        r.status.tone === 'own'
                          ? d.ownPill
                          : r.status.tone === 'flexi'
                            ? d.okPill
                            : d.pillIdle
                      }
                    >
                      {r.status.text}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={d.mappingFooter}>
        <p>
          <span className={out.conflicts ? d.dotWarn : d.dotIdle} aria-hidden />
          {t.footerStatus}
        </p>
        <div className={d.mappingFooterRight}>
          <span>{te.conflicts.replace('{n}', String(out.conflicts))}</span>
          <button type="button" className={d.btnLink} onClick={exportCsv}>
            {t.exportDiff}
          </button>
        </div>
      </div>
    </>
  );

  /** CSV of the table (UTF-8 with BOM for Excel), values as the user sees them. */
  function exportCsv() {
    // Quote every cell; a leading = + - @ tab or CR would start a spreadsheet formula.
    const esc = (v: string) =>
      `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
    const lines = [
      [te.csvAttribute, te.csvFlexi, te.csvRule, te.csvShoptet],
      ...rows.map((r) => [r.label, r.flexiText, r.rule.text, r.shoptetText]),
    ].map((cols) => cols.map((c) => esc(c.trim())).join(';'));
    const blob = new Blob(['﻿' + lines.join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mapovani-${data.kod}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

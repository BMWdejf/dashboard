import { shoptetExtId, type FlexiId } from '@repo/client-flexi';
import type { ShoptetOrder, ShoptetOrderItem } from '@repo/client-shoptet';

/**
 * Shoptet order → ABRA Flexi `objednavka-prijata` (received order).
 *
 * Pure function: no I/O, so every rule here is covered by unit tests. Field
 * names follow the Flexi evidence; check new ones against the evidence's
 * property list (/c/{firma}/objednavka-prijata/properties.json).
 */
export interface OrderMappingOptions {
  /** Document type, e.g. `code:OBP`. Omitted → Flexi's default type. */
  documentType?: `code:${string}`;
  /** Link product lines to the price list (`cenik`) by Shoptet product code. */
  linkPriceList?: boolean;
}

export interface FlexiOrderLine {
  nazev: string;
  kod?: string;
  mnozMj: number;
  mj?: `code:${string}`;
  cenaMj: number;
  szbDph: number;
  typCenyDphK: 'typCeny.bezDph';
  cenik?: FlexiId;
}

export interface FlexiReceivedOrder {
  id: FlexiId;
  typDokl?: `code:${string}`;
  cisObj: string;
  datVyst: string;
  nazFirmy: string;
  ulice?: string;
  mesto?: string;
  psc?: string;
  stat?: `code:${string}`;
  ic?: string;
  dic?: string;
  email?: string;
  mena: `code:${string}`;
  polozkyObchDokladu: FlexiOrderLine[];
}

export const ORDER_EVIDENCE = 'objednavka-prijata';

/** Item types that become order lines; others (e.g. discounts) need rules first. */
const LINE_TYPES = new Set(['product', 'shipping', 'billing', 'service']);

export class MappingError extends Error {
  constructor(
    public readonly orderCode: string,
    message: string,
  ) {
    super(`Order ${orderCode}: ${message}`);
    this.name = 'MappingError';
  }
}

export function orderExtId(code: string): FlexiId {
  return shoptetExtId('order', code);
}

/** "2026-11-10T09:15:00+0100" → "2026-11-10" (the shop's local date). */
export function toFlexiDate(shoptetTime: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(shoptetTime);
  if (!m?.[1]) throw new Error(`Not a Shoptet date-time: ${shoptetTime}`);
  return m[1];
}

function num(orderCode: string, field: string, value: string | undefined): number {
  const n = Number(value);
  if (value === undefined || value === '' || !Number.isFinite(n)) {
    throw new MappingError(orderCode, `${field} is not a number (${String(value)})`);
  }
  return n;
}

function mapLine(
  orderCode: string,
  item: ShoptetOrderItem,
  opts: OrderMappingOptions,
): FlexiOrderLine {
  const line: FlexiOrderLine = {
    nazev: item.name,
    mnozMj: num(orderCode, `${item.name}.amount`, item.amount),
    cenaMj: num(orderCode, `${item.name}.itemPrice.withoutVat`, item.itemPrice.withoutVat),
    szbDph: num(orderCode, `${item.name}.itemPrice.vatRate`, item.itemPrice.vatRate),
    typCenyDphK: 'typCeny.bezDph',
  };
  if (item.code) line.kod = item.code;
  if (item.amountUnit) line.mj = `code:${item.amountUnit.toUpperCase()}`;
  if (opts.linkPriceList && item.itemType === 'product' && item.code) {
    line.cenik = `code:${item.code}`;
  }
  return line;
}

export function mapShoptetOrderToFlexi(
  order: ShoptetOrder,
  opts: OrderMappingOptions = {},
): FlexiReceivedOrder {
  const bill = order.billingAddress ?? {};
  const name = bill.company || bill.fullName;
  if (!name) throw new MappingError(order.code, 'billing address has no company or name');

  const lines = order.items
    .filter((i) => LINE_TYPES.has(i.itemType))
    .map((i) => mapLine(order.code, i, opts));
  if (lines.length === 0) throw new MappingError(order.code, 'no billable items');

  const street = [bill.street, bill.houseNumber].filter(Boolean).join(' ');
  const record: FlexiReceivedOrder = {
    id: orderExtId(order.code),
    cisObj: order.code,
    datVyst: toFlexiDate(order.creationTime),
    nazFirmy: name,
    mena: `code:${order.price?.currencyCode ?? 'CZK'}`,
    polozkyObchDokladu: lines,
  };
  if (opts.documentType) record.typDokl = opts.documentType;
  if (street) record.ulice = street;
  if (bill.city) record.mesto = bill.city;
  if (bill.zip) record.psc = bill.zip;
  if (bill.countryCode) record.stat = `code:${bill.countryCode}`;
  if (bill.companyId) record.ic = bill.companyId;
  if (bill.vatId) record.dic = bill.vatId;
  if (order.email) record.email = order.email;
  return record;
}

import { z } from 'zod';

/**
 * Shoptet REST API schemas. Only the fields the dashboard uses are modelled;
 * unknown fields pass through. Check new fields against
 * https://api.docs.shoptet.com before relying on them.
 */

/** Shoptet sends money and amounts as decimal strings, e.g. "121.00". */
export const decimal = z.union([z.string(), z.number()]).transform((v) => String(v));

export const apiError = z.object({
  errorCode: z.string(),
  message: z.string(),
  instance: z.string().optional(),
});

export const envelope = <T extends z.ZodType>(data: T) =>
  z.object({
    data: data.nullable(),
    errors: z.array(apiError).nullable().optional(),
    metadata: z.looseObject({ requestId: z.string().optional() }).optional(),
  });

export const paginator = z.object({
  totalCount: z.number(),
  page: z.number(),
  pageCount: z.number(),
  itemsOnPage: z.number(),
  itemsPerPage: z.number(),
});

export const price = z.looseObject({
  withVat: decimal.optional(),
  withoutVat: decimal.optional(),
  vat: decimal.optional(),
  vatRate: decimal.optional(),
  currencyCode: z.string().optional(),
});

export const address = z.looseObject({
  company: z.string().nullish(),
  fullName: z.string().nullish(),
  street: z.string().nullish(),
  houseNumber: z.string().nullish(),
  city: z.string().nullish(),
  zip: z.string().nullish(),
  countryCode: z.string().nullish(),
  companyId: z.string().nullish(),
  vatId: z.string().nullish(),
});

export const orderItem = z.looseObject({
  itemType: z.string(),
  code: z.string().nullish(),
  name: z.string(),
  amount: decimal,
  amountUnit: z.string().nullish(),
  itemPrice: price,
});

export const order = z.looseObject({
  code: z.string(),
  guid: z.string().optional(),
  creationTime: z.string(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  billingAddress: address.nullish(),
  deliveryAddress: address.nullish(),
  price: price.optional(),
  items: z.array(orderItem).default([]),
});

export const orderSummary = z.looseObject({
  code: z.string(),
  guid: z.string().optional(),
  creationTime: z.string(),
  changeTime: z.string().nullish(),
});

export const product = z.looseObject({
  guid: z.string(),
  name: z.string(),
  visibility: z.string().optional(),
});

export type ShoptetOrder = z.infer<typeof order>;
export type ShoptetOrderItem = z.infer<typeof orderItem>;
export type ShoptetOrderSummary = z.infer<typeof orderSummary>;
export type ShoptetProduct = z.infer<typeof product>;
export type ShoptetPaginator = z.infer<typeof paginator>;

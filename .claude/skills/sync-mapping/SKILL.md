---
name: sync-mapping
description: Change how Shoptet records map to ABRA Flexi records in @repo/core-sync (packages/core/sync) — order, customer, product or stock mapping, VAT, prices, units, currencies. Use for any field-level sync rule between Shoptet and Flexi.
---

# Shoptet ↔ ABRA Flexi mapping

`packages/core/sync/src/` holds **pure functions**: no `fetch`, no database,
no clock. Every rule is a unit test. The worker does the I/O around them:
fetch from Shoptet, map, `FlexiClient.upsert`.

## Order → `objednavka-prijata` (`orders.ts`)

| Shoptet | Flexi | Rule |
|---|---|---|
| `code` | `id` = `ext:SHOPTET:order:<code>`, `cisObj` | mapping key, repeatable |
| `creationTime` | `datVyst` | local date part, `YYYY-MM-DD` |
| `billingAddress.company` or `fullName` | `nazFirmy` | company wins |
| `street` + `houseNumber`, `city`, `zip` | `ulice`, `mesto`, `psc` | |
| `countryCode` | `stat` = `code:CZ` | |
| `companyId`, `vatId` | `ic`, `dic` | |
| `price.currencyCode` | `mena` = `code:CZK` | default CZK |
| items `product`, `shipping`, `billing`, `service` | `polozkyObchDokladu[]` | other types are dropped |
| item `amount` | `mnozMj` | number |
| item `itemPrice.withoutVat` | `cenaMj`, `typCenyDphK: typCeny.bezDph` | unit price without VAT |
| item `itemPrice.vatRate` | `szbDph` | percent |
| item `code` | `kod`, and `cenik: code:<code>` when `linkPriceList` | |

**Open decisions:** ask before changing these, they are business rules.

- **Discounts and coupons** (`discount-coupon`, …) are dropped today. Should
  they become a negative line, or a discount on the whole document?
- **Document type (`typDokl`)**: which type the company uses for e-shop orders.
- **Rounding**: Flexi recomputes totals from lines. Compare them with Shoptet's
  `price.withVat` and flag a difference instead of hiding it.

## Changing or adding a mapping

1. Write the test first in `*.spec.ts`, using a Shoptet record built through
   the client's zod schema (`order.parse({...})`) so the input is realistic.
2. Keep the function pure and total. When data is unusable, throw
   `MappingError` with the order code, so the job records it and a human can see it.
3. Use only Flexi fields that exist in the evidence's `properties.json`.
4. Update the table above in the same change.

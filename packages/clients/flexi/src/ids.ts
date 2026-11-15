/**
 * ABRA Flexi record identifiers.
 *
 * - `123`             internal id, assigned by Flexi
 * - `code:CZK`        the record's `kod`
 * - `ext:SHOP:abc`    external id set by an integration (our mapping key)
 *
 * In a URL several ids combine as `[123][code:CZK][ext:SHOP:abc]`; unknown ids
 * are ignored, but every known one must point at the same record.
 */
export type FlexiId = number | `code:${string}` | `ext:${string}`;

export const code = (kod: string): `code:${string}` => `code:${kod}`;

/** External id namespace for records that come from Shoptet. */
export const shoptetExtId = (entity: string, shoptetId: string): `ext:${string}` =>
  `ext:SHOPTET:${entity}:${shoptetId}`;

export function idPath(ids: FlexiId | FlexiId[]): string {
  const list = Array.isArray(ids) ? ids : [ids];
  if (list.length === 1) return encodeURIComponent(String(list[0]));
  return list.map((id) => `[${encodeURIComponent(String(id))}]`).join('');
}

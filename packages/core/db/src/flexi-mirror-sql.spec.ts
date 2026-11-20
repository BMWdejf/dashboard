import { describe, expect, it } from '@jest/globals';

import { MIRROR_EVIDENCES } from '@repo/core-sync';

import { toSnakeRows, upsertSql } from './flexi-mirror-sql';

describe('flexi mirror SQL', () => {
  it('turns row keys into column names', () => {
    expect(toSnakeRows([{ flexiId: 1, cenikFlexiId: 2, lastUpdate: null }])).toEqual([
      { flexi_id: 1, cenik_flexi_id: 2, last_update: null },
    ]);
  });

  it('upserts a code list by flexi_id', () => {
    expect(upsertSql('sklad')).toBe(
      [
        'INSERT INTO flexi_sklad (flexi_id, last_update, synced_at, kod, nazev)',
        'SELECT r.flexi_id, r.last_update, now(), r.kod, r.nazev',
        'FROM jsonb_to_recordset($1::jsonb) AS r(flexi_id int, last_update timestamptz, kod text, nazev text)',
        'ON CONFLICT (flexi_id) DO UPDATE SET last_update = EXCLUDED.last_update, synced_at = EXCLUDED.synced_at, kod = EXCLUDED.kod, nazev = EXCLUDED.nazev',
      ].join('\n'),
    );
  });

  it('skips stock cards whose product, warehouse or period is missing', () => {
    const sql = upsertSql('skladova-karta');
    expect(sql).toContain('\nJOIN flexi_cenik c ON c.flexi_id = r.cenik_flexi_id');
    expect(sql).toContain('\nJOIN flexi_sklad s ON s.flexi_id = r.sklad_flexi_id');
    expect(sql).not.toContain('LEFT JOIN');
  });

  it('keeps a product whose group is unknown and revives a deleted one', () => {
    const sql = upsertSql('cenik');
    expect(sql).toContain('LEFT JOIN flexi_skupina_zbozi sk');
    expect(sql).toContain('deleted_at = EXCLUDED.deleted_at');
  });

  it('has a value for every column of every evidence', () => {
    for (const evidence of MIRROR_EVIDENCES) expect(() => upsertSql(evidence)).not.toThrow();
  });
});

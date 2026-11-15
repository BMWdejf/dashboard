import { describe, expect, it } from '@jest/globals';

import { toDashboard, type ExampleRow } from './dashboard';

const row = (r: Partial<ExampleRow> & Pick<ExampleRow, 'section' | 'label' | 'value'>): ExampleRow => ({
  position: 0,
  value2: null,
  changePct: null,
  status: null,
  occurredAt: null,
  ...r,
});

describe('toDashboard', () => {
  it('groups rows by section in position order', () => {
    const d = toDashboard([
      row({ section: 'kpi', label: 'Monthly users', value: 23600, position: 1, changePct: -12.6 }),
      row({ section: 'kpi', label: 'Pageviews', value: 50800, position: 0, changePct: 28.4 }),
      row({ section: 'revenue', label: 'Jan', value: 82000, value2: 64000 }),
      row({ section: 'country', label: 'Spain', value: 15, value2: 1860 }),
      row({ section: 'summary', label: 'total_revenue', value: 240800, changePct: 24.6 }),
      row({
        section: 'order',
        label: '#1532',
        value: 329.4,
        status: 'paid',
        occurredAt: new Date('2025-12-30T10:06:00Z'),
      }),
    ]);

    expect(d.kpis.map((k) => k.label)).toEqual(['Pageviews', 'Monthly users']);
    expect(d.revenue).toEqual([{ label: 'Jan', revenue: 82000, expenses: 64000 }]);
    expect(d.countries).toEqual([{ label: 'Spain', share: 15, users: 1860 }]);
    expect(d.summary.totalRevenue).toBe(240800);
    expect(d.summary.totalRevenueChange).toBe(24.6);
    expect(d.orders[0]).toMatchObject({ code: '#1532', total: 329.4, status: 'paid' });
  });

  it('returns empty widgets and null totals without data', () => {
    const d = toDashboard([]);
    expect(d.kpis).toEqual([]);
    expect(d.summary.totalProfit).toBeNull();
  });
});

import { describe, expect, it } from '@jest/globals';

import { movementDeltas } from './movements';

const line = (id: string, cenik: string, day: string, prijem: string, vydej: string, storno = 'false') => ({
  id,
  cenik: `code:X${cenik}`,
  'cenik@ref': `/c/demo/cenik/${cenik}.json`,
  datVyst: `${day}+01:00`,
  mnozMjPrijem: prijem,
  mnozMjVydej: vydej,
  storno,
});

describe('movementDeltas', () => {
  it('sums receipts minus issues per product and day', () => {
    expect(
      movementDeltas([
        line('1', '168', '2025-04-17', '1.0', '0.0'),
        line('2', '168', '2025-04-17', '1.0', '0.0'),
        line('3', '168', '2025-08-25', '0.0', '1.0'),
        line('4', '164', '2025-08-25', '2.5', '0.0'),
      ]),
    ).toEqual([
      { cenikFlexiId: 168, day: '2025-04-17', delta: '2' },
      { cenikFlexiId: 168, day: '2025-08-25', delta: '-1' },
      { cenikFlexiId: 164, day: '2025-08-25', delta: '2.5' },
    ]);
  });

  it('skips cancelled lines, lines without a product and net-zero days', () => {
    expect(
      movementDeltas([
        line('1', '9', '2025-02-14', '0.0', '1.0', 'true'),
        { ...line('2', '9', '2025-02-14', '1', '0'), 'cenik@ref': '' },
        line('3', '7', '2025-03-01', '3', '0'),
        line('4', '7', '2025-03-01', '0', '3'),
      ]),
    ).toEqual([]);
  });

  it('adds decimals exactly', () => {
    expect(
      movementDeltas([line('1', '5', '2025-01-02', '0.1', '0'), line('2', '5', '2025-01-02', '0.2', '0')]),
    ).toEqual([{ cenikFlexiId: 5, day: '2025-01-02', delta: '0.3' }]);
  });
});

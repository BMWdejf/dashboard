-- Example dashboard data (design/figma "Dashboard v1"). Idempotent: replaces
-- every row of examples_data. Values shown in the design are copied as-is;
-- the rest (monthly series, trends, order codes and statuses) are invented
-- to fit them. Run: pnpm --filter @repo/core-db db:seed-examples
BEGIN;

DELETE FROM examples_data;

INSERT INTO examples_data (section, label, position, value, value2, change_pct, status, occurred_at) VALUES
  -- Headline totals
  ('summary', 'total_revenue',  0, 240800, NULL, 24.6, NULL, NULL),
  ('summary', 'total_profit',   1, 144600, NULL, 28.5, NULL, NULL),
  ('summary', 'total_sessions', 2,    400, NULL, 16.8, NULL, NULL),
  ('summary', 'visitors',       3,  10000, NULL, NULL, NULL, NULL),
  ('summary', 'country_users',  4,  12400, NULL, 25.8, NULL, NULL),

  -- KPI cards
  ('kpi', 'Pageviews',     0, 50800, NULL,  28.4, NULL, NULL),
  ('kpi', 'Monthly users', 1, 23600, NULL, -12.6, NULL, NULL),
  ('kpi', 'New sign ups',  2,   756, NULL,   3.1, NULL, NULL),
  ('kpi', 'Subscriptions', 3,  2300, NULL,  11.3, NULL, NULL),

  -- Revenue (value) vs expenses (value2) per month
  ('revenue', 'Jan',  0,  82000,  64000, NULL, NULL, NULL),
  ('revenue', 'Feb',  1,  96000,  70000, NULL, NULL, NULL),
  ('revenue', 'Mar',  2, 118000,  76000, NULL, NULL, NULL),
  ('revenue', 'Apr',  3, 104000,  81000, NULL, NULL, NULL),
  ('revenue', 'May',  4, 140000,  92000, NULL, NULL, NULL),
  ('revenue', 'Jun',  5, 125200,  98000, NULL, NULL, NULL),
  ('revenue', 'Jul',  6, 160000, 104000, NULL, NULL, NULL),
  ('revenue', 'Aug',  7, 150000, 112000, NULL, NULL, NULL),
  ('revenue', 'Sep',  8, 178000, 118000, NULL, NULL, NULL),
  ('revenue', 'Oct',  9, 170000, 126000, NULL, NULL, NULL),
  ('revenue', 'Nov', 10, 205000, 132000, NULL, NULL, NULL),
  ('revenue', 'Dec', 11, 240800, 141000, NULL, NULL, NULL),

  -- Profit per month (bar chart)
  ('profit', 'Jan',  0,  9800, NULL, NULL, NULL, NULL),
  ('profit', 'Feb',  1, 11200, NULL, NULL, NULL, NULL),
  ('profit', 'Mar',  2, 13600, NULL, NULL, NULL, NULL),
  ('profit', 'Apr',  3,  8900, NULL, NULL, NULL, NULL),
  ('profit', 'May',  4, 12400, NULL, NULL, NULL, NULL),
  ('profit', 'Jun',  5, 14100, NULL, NULL, NULL, NULL),
  ('profit', 'Jul',  6, 10300, NULL, NULL, NULL, NULL),
  ('profit', 'Aug',  7, 12900, NULL, NULL, NULL, NULL),
  ('profit', 'Sep',  8, 11800, NULL, NULL, NULL, NULL),
  ('profit', 'Oct',  9, 13300, NULL, NULL, NULL, NULL),
  ('profit', 'Nov', 10, 12700, NULL, NULL, NULL, NULL),
  ('profit', 'Dec', 11, 13600, NULL, NULL, NULL, NULL),

  -- Sessions through the day (sparkline)
  ('sessions', '12 AM', 0, 120, NULL, NULL, NULL, NULL),
  ('sessions', '2 AM',  1,  90, NULL, NULL, NULL, NULL),
  ('sessions', '4 AM',  2,  70, NULL, NULL, NULL, NULL),
  ('sessions', '6 AM',  3, 140, NULL, NULL, NULL, NULL),
  ('sessions', '8 AM',  4, 260, NULL, NULL, NULL, NULL),
  ('sessions', '10 AM', 5, 330, NULL, NULL, NULL, NULL),
  ('sessions', '12 PM', 6, 300, NULL, NULL, NULL, NULL),
  ('sessions', '2 PM',  7, 380, NULL, NULL, NULL, NULL),
  ('sessions', '4 PM',  8, 420, NULL, NULL, NULL, NULL),
  ('sessions', '6 PM',  9, 360, NULL, NULL, NULL, NULL),
  ('sessions', '8 PM', 10, 410, NULL, NULL, NULL, NULL),
  ('sessions', '11 PM',11, 400, NULL, NULL, NULL, NULL),

  -- Users by device (sums to 23,648)
  ('device', 'Desktop users',   0, 15624, NULL, NULL, NULL, NULL),
  ('device', 'Phone app users', 1,  5546, NULL, NULL, NULL, NULL),
  ('device', 'Laptop users',    2,  2478, NULL, NULL, NULL, NULL),

  -- Users by country: value = share in %, value2 = users
  ('country', 'United States',  0, 30, 3720, NULL, NULL, NULL),
  ('country', 'United Kingdom', 1, 20, 2480, NULL, NULL, NULL),
  ('country', 'Canada',         2, 20, 2480, NULL, NULL, NULL),
  ('country', 'Australia',      3, 15, 1860, NULL, NULL, NULL),
  ('country', 'Spain',          4, 15, 1860, NULL, NULL, NULL),

  -- Recent orders: label = order code, value = total
  ('order', '#1532', 0, 329.40, NULL, NULL, 'paid',    '2025-12-30 10:06:00+00'),
  ('order', '#1531', 1, 117.24, NULL, NULL, 'pending', '2025-12-29 02:59:00+00'),
  ('order', '#1530', 2,  52.16, NULL, NULL, 'pending', '2025-12-29 00:54:00+00'),
  ('order', '#1529', 3, 350.52, NULL, NULL, 'paid',    '2025-12-28 14:32:00+00'),
  ('order', '#1528', 4, 246.78, NULL, NULL, 'paid',    '2025-12-27 14:20:00+00'),
  ('order', '#1527', 5,  64.00, NULL, NULL, 'pending', '2025-12-26 09:48:00+00');

COMMIT;

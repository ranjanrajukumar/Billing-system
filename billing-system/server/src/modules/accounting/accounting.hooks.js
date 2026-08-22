import { on, POINTS } from '../platform/extensions.service.js';
import { seedChartOfAccounts } from './accounting.service.js';

/**
 * What accounting does when the business changes shape.
 *
 * Switching to Advanced mode is a settings action, and settings used to reach
 * into accounting to seed the chart. That put platform in the position of
 * knowing that accounting exists and what it needs doing to it — and the next
 * module that wants to react to a mode change would have added a second import
 * to the same file.
 *
 * Now settings announces the change and whoever cares acts on it. A Basic shop
 * that never switches never seeds a chart it has no use for, exactly as before.
 */
on(POINTS.MODE_CHANGED, async ({ mode }) => {
  if (mode === 'Advanced') await seedChartOfAccounts();
});

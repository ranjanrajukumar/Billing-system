import { Chip } from '@mui/material';

/**
 * One place that decides what a document status looks like.
 *
 * Colour carries meaning across every screen: green is done, amber is waiting
 * on someone, blue is in motion, red stopped. Defining it once means a user who
 * learns it on transfers already reads purchase orders correctly.
 */
const COLOURS = {
  // Waiting on a person.
  Draft: 'default',
  Pending: 'warning',
  'Pending Approval': 'warning',
  'Pending QC': 'warning',
  Counting: 'warning',
  Unpaid: 'warning',

  // In motion.
  Approved: 'info',
  Allocated: 'info',
  Picking: 'info',
  Picked: 'info',
  Packed: 'info',
  ReadyToShip: 'info',
  Sealed: 'info',
  Dispatched: 'info',
  InTransit: 'info',
  'Partially Received': 'info',
  PartiallyReceived: 'info',
  'Partially Paid': 'info',
  Open: 'info',

  // Done.
  Received: 'success',
  Completed: 'success',
  Confirmed: 'success',
  Posted: 'success',
  Paid: 'success',
  Closed: 'success',
  Delivered: 'success',
  'In Stock': 'success',

  // Stopped.
  Rejected: 'error',
  Cancelled: 'error',
  Reversed: 'error',
  Damaged: 'error',
  Scrapped: 'error',
};

export default function StatusChip({ status, size = 'small' }) {
  if (!status) return null;
  return (
    <Chip
      label={String(status).replace(/([a-z])([A-Z])/g, '$1 $2')}
      size={size}
      color={COLOURS[status] || 'default'}
      variant={COLOURS[status] ? 'filled' : 'outlined'}
      sx={{ fontWeight: 700, fontSize: '0.7rem' }}
    />
  );
}

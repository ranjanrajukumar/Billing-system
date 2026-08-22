import { alpha, Chip } from '@mui/material';

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
  // Material is out of the store and somebody still has it.
  Issued: 'info',
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
  // The condition a returned item came back in.
  Good: 'success',

  // Stopped.
  Rejected: 'error',
  Cancelled: 'error',
  Reversed: 'error',
  Damaged: 'error',
  Scrapped: 'error',
};

/**
 * A status pill.
 *
 * Uppercase text on a tinted background rather than a solid fill, matching the
 * Zentory tables: a column of solid chips draws the eye harder than the data
 * beside it, and status is context, not the headline. The tint keeps the colour
 * coding readable while letting the row's actual content stay dominant.
 */
export default function StatusChip({ status, size = 'small' }) {
  if (!status) return null;

  const colour = COLOURS[status] || 'default';
  const label = String(status).replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();

  return (
    <Chip
      label={label}
      size={size}
      sx={(theme) => {
        const palette = colour === 'default' ? null : theme.palette[colour];
        return {
          fontWeight: 800,
          fontSize: '0.68rem',
          letterSpacing: '0.03em',
          height: 22,
          borderRadius: 0.5,
          border: '1px solid',
          borderColor: palette ? alpha(palette.main, 0.35) : 'divider',
          color: palette ? palette.main : 'text.secondary',
          bgcolor: palette ? alpha(palette.main, 0.12) : 'action.hover',
          '& .MuiChip-label': { px: 0.9 },
        };
      }}
    />
  );
}

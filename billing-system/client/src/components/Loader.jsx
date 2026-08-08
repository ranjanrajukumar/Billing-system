import { Box, Skeleton, Stack } from '@mui/material';

function SkeletonRow() {
  return (
    <Stack direction="row" spacing={2} alignItems="center" sx={{ px: 2, py: 1.5 }}>
      <Skeleton variant="circular" width={36} height={36} />
      <Box sx={{ flex: 1 }}>
        <Skeleton variant="text" width="55%" height={16} sx={{ mb: 0.5 }} />
        <Skeleton variant="text" width="35%" height={13} />
      </Box>
      <Skeleton variant="rounded" width={64} height={24} sx={{ borderRadius: 1 }} />
    </Stack>
  );
}

export default function Loader({ rows = 5 }) {
  return (
    <Box sx={{ borderRadius: 2.5, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
      {/* Header skeleton */}
      <Box
        sx={{
          display: 'flex',
          gap: 4,
          px: 2,
          py: 1.25,
          bgcolor: 'action.hover',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        {[40, 25, 20, 15].map((w, i) => (
          <Skeleton key={i} variant="text" width={`${w}%`} height={14} />
        ))}
      </Box>
      {/* Row skeletons */}
      {Array.from({ length: rows }).map((_, i) => (
        <Box key={i} sx={{ borderBottom: '1px solid', borderColor: 'divider', '&:last-child': { border: 0 } }}>
          <SkeletonRow />
        </Box>
      ))}
    </Box>
  );
}

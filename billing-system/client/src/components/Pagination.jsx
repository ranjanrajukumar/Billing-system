import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { alpha, Box, IconButton, MenuItem, Select, Stack, Typography, useTheme } from '@mui/material';

export default function Pagination({ meta, onChangePage, onChangeLimit }) {
  const theme = useTheme();
  if (!meta || !meta.total) return null;

  const { page = 1, limit = 10, total = 0, totalPages = 1 } = meta;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  const btnSx = (active) => ({
    width: 32,
    height: 32,
    borderRadius: 1.5,
    bgcolor: active ? 'primary.main' : alpha(theme.palette.action.hover, 0.8),
    color: active ? '#fff' : 'text.secondary',
    '&:hover': {
      bgcolor: active ? 'primary.dark' : alpha(theme.palette.primary.main, 0.1),
    },
    '&:disabled': { opacity: 0.35 },
    transition: 'all 0.15s',
  });

  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'flex-start', sm: 'center' }}
      spacing={1.5}
      sx={{ mt: 1 }}
    >
      <Typography variant="body2" color="text.secondary">
        Showing <strong>{from}–{to}</strong> of <strong>{total}</strong> records
      </Typography>

      <Stack direction="row" alignItems="center" spacing={1}>
        <Select
          size="small"
          value={limit}
          onChange={(e) => onChangeLimit(Number(e.target.value))}
          sx={{
            fontSize: '0.8rem',
            height: 32,
            borderRadius: 1.5,
            '& .MuiSelect-select': { py: '5px' },
          }}
        >
          {[10, 25, 50, 100].map((n) => (
            <MenuItem key={n} value={n} sx={{ fontSize: '0.8rem' }}>{n} / page</MenuItem>
          ))}
        </Select>

        <Stack direction="row" spacing={0.5}>
          <IconButton
            size="small"
            disabled={page <= 1}
            onClick={() => onChangePage(page - 1)}
            sx={btnSx(false)}
          >
            <ChevronLeftIcon sx={{ fontSize: 18 }} />
          </IconButton>

          {/* Page numbers */}
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
            .reduce((acc, p, i, arr) => {
              if (i > 0 && p - arr[i - 1] > 1) acc.push('…');
              acc.push(p);
              return acc;
            }, [])
            .map((p, i) =>
              p === '…' ? (
                <Typography key={`ellipsis-${i}`} sx={{ px: 0.5, lineHeight: '32px', color: 'text.secondary', fontSize: '0.875rem' }}>
                  …
                </Typography>
              ) : (
                <IconButton
                  key={p}
                  size="small"
                  onClick={() => onChangePage(p)}
                  sx={btnSx(p === page)}
                >
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, lineHeight: 1 }}>{p}</Typography>
                </IconButton>
              )
            )}

          <IconButton
            size="small"
            disabled={page >= totalPages}
            onClick={() => onChangePage(page + 1)}
            sx={btnSx(false)}
          >
            <ChevronRightIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Stack>
      </Stack>
    </Stack>
  );
}

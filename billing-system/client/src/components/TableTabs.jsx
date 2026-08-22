import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
import { Box, IconButton, Stack } from '@mui/material';

/**
 * The status strip: a row of pills, with the page's search on the right.
 *
 * Fully rounded pills at 14px, matching Zentory's `TabFilters` — the shape is
 * what separates "pick one of these" from the squarer controls in the table's
 * own toolbar below, which act on whatever the tab has already selected.
 *
 * Each pill can carry a count, and the count is most of the value: "Picking 12"
 * tells an operator where the work is before they have filtered anything.
 *
 * Presentational only. Whether a tab filters rows already loaded or refetches
 * from the server is the page's business, and the two must not be decided here.
 */
export default function TableTabs({
  tabs = [],
  value,
  onChange,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
  sx,
}) {
  if (!tabs.length && !onSearchChange) return null;

  return (
    <Stack
      direction="row"
      alignItems="center"
      gap={1}
      sx={{
        px: 1.25, py: 0.75,
        borderBottom: '1px solid',
        borderColor: 'divider',
        overflowX: 'auto',
        '&::-webkit-scrollbar': { height: 4 },
        '&::-webkit-scrollbar-thumb': { borderRadius: 2, bgcolor: 'divider' },
        ...sx,
      }}
    >
      {tabs.map((tab) => {
        const selected = String(tab.value) === String(value);
        return (
          <Box
            key={tab.value}
            component="button"
            type="button"
            onClick={() => onChange?.(tab.value)}
            aria-pressed={selected}
            sx={{
              display: 'inline-flex', alignItems: 'center', gap: 0.75,
              px: 2, py: 0.6, flexShrink: 0,
              border: '1px solid',
              borderColor: selected ? 'primary.main' : 'divider',
              borderRadius: 999,
              cursor: 'pointer',
              font: 'inherit',
              fontSize: '0.875rem',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              bgcolor: selected ? 'primary.main' : 'background.paper',
              color: selected ? 'primary.contrastText' : 'text.primary',
              transition: 'background-color 120ms, border-color 120ms',
              '&:hover': { bgcolor: selected ? 'primary.dark' : 'action.hover' },
            }}
          >
            {tab.label}
            {tab.count !== undefined && tab.count !== null && (
              <Box
                component="span"
                sx={{
                  px: 0.7, borderRadius: 999, fontSize: '0.75rem', fontWeight: 700,
                  bgcolor: selected ? 'rgba(255,255,255,0.25)' : 'action.hover',
                  color: selected ? 'inherit' : 'text.secondary',
                }}
              >
                {tab.count}
              </Box>
            )}
          </Box>
        );
      })}

      {onSearchChange && (
        <Box sx={{ ml: 'auto', minWidth: 220, maxWidth: 320, flex: 1, display: 'flex' }}>
          <Box
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.75, width: '100%',
              px: 1.5, py: 0.5,
              border: '1px solid', borderColor: 'divider', borderRadius: 999,
              '&:focus-within': { borderColor: 'primary.main' },
            }}
          >
            <SearchIcon sx={{ fontSize: 16, color: 'text.secondary', flexShrink: 0 }} />
            <Box
              component="input"
              value={searchValue ?? ''}
              placeholder={searchPlaceholder}
              onChange={(event) => onSearchChange(event.target.value)}
              aria-label={searchPlaceholder}
              sx={{
                flex: 1, minWidth: 0, border: 'none', outline: 'none',
                bgcolor: 'transparent', color: 'text.primary',
                font: 'inherit', fontSize: '0.875rem',
                '&::placeholder': { color: 'text.secondary', opacity: 1 },
              }}
            />
            {searchValue && (
              <IconButton size="small" onClick={() => onSearchChange('')} aria-label="Clear search" sx={{ p: 0.25 }}>
                <ClearIcon sx={{ fontSize: 14 }} />
              </IconButton>
            )}
          </Box>
        </Box>
      )}
    </Stack>
  );
}

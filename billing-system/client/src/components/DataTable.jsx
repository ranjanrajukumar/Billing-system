import {
  alpha,
  Box,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import InboxIcon from '@mui/icons-material/Inbox';

/**
 * DataTable — responsive table that becomes stacked cards on mobile
 * Props: columns [{field, headerName, render}], rows, mobileKeyField (column field for card title)
 */
export default function DataTable({ columns, rows, mobileKeyField }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Mobile: card view
  if (isMobile) {
    if (!rows?.length) {
      return (
        <Box
          sx={{
            textAlign: 'center',
            py: 6,
            color: 'text.secondary',
          }}
        >
          <InboxIcon sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No records found
          </Typography>
        </Box>
      );
    }
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {rows.map((row, ri) => (
          <Paper
            key={row.id ?? ri}
            variant="outlined"
            className="animate-fadeInUp"
            sx={{
              borderRadius: 2.5,
              overflow: 'hidden',
              animationDelay: `${ri * 0.04}s`,
              border: `1px solid ${alpha(theme.palette.divider, 1)}`,
            }}
          >
            {columns
              .filter((col) => col.field !== 'actions')
              .map((col) => {
                const value = col.render ? col.render(row) : row[col.field];
                const isKey = col.field === mobileKeyField || col.field === columns[0]?.field;
                return (
                  <Box
                    key={col.field}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      px: 2,
                      py: isKey ? 1.25 : 0.85,
                      borderBottom: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
                      bgcolor: isKey
                        ? alpha(theme.palette.primary.main, 0.04)
                        : 'transparent',
                      '&:last-of-type': { borderBottom: 'none' },
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: 'text.secondary',
                        fontSize: '0.68rem',
                        minWidth: 80,
                        flexShrink: 0,
                      }}
                    >
                      {col.headerName}
                    </Typography>
                    <Box
                      sx={{
                        textAlign: 'right',
                        fontWeight: isKey ? 700 : 400,
                        fontSize: isKey ? '0.9rem' : '0.875rem',
                        maxWidth: '60%',
                        wordBreak: 'break-word',
                      }}
                    >
                      {value ?? '-'}
                    </Box>
                  </Box>
                );
              })}
            {/* Actions row */}
            {columns.find((c) => c.field === 'actions') && (
              <Box
                sx={{
                  px: 2,
                  py: 0.75,
                  display: 'flex',
                  justifyContent: 'flex-end',
                  bgcolor: alpha(theme.palette.action.hover, 0.5),
                }}
              >
                {columns.find((c) => c.field === 'actions').render(row)}
              </Box>
            )}
          </Paper>
        ))}
      </Box>
    );
  }

  // Desktop: table view
  return (
    <TableContainer
      component={Paper}
      variant="outlined"
      sx={{
        borderRadius: 2.5,
        border: `1px solid ${alpha(theme.palette.divider, 1)}`,
        overflow: 'hidden',
      }}
    >
      <Table size="small" sx={{ minWidth: 480 }}>
        <TableHead>
          <TableRow>
            {columns.map((col) => (
              <TableCell key={col.field} sx={{ whiteSpace: 'nowrap' }}>
                {col.headerName}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows?.map((row, ri) => (
            <TableRow
              key={row.id ?? ri}
              hover
              className="animate-fadeInUp"
              sx={{ animationDelay: `${ri * 0.03}s`, '&:last-child td': { border: 0 } }}
            >
              {columns.map((col) => (
                <TableCell key={col.field} sx={{ whiteSpace: 'nowrap' }}>
                  {col.render ? col.render(row) : (row[col.field] ?? '-')}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {!rows?.length && (
            <TableRow>
              <TableCell colSpan={columns.length} sx={{ border: 0 }}>
                <Box sx={{ textAlign: 'center', py: 5, color: 'text.secondary' }}>
                  <InboxIcon sx={{ fontSize: 40, opacity: 0.3, mb: 1, display: 'block', mx: 'auto' }} />
                  <Typography variant="body2" color="text.secondary">
                    No records found
                  </Typography>
                </Box>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

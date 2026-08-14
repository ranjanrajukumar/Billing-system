import ErrorIcon from '@mui/icons-material/Error';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import TodayIcon from '@mui/icons-material/Today';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  alpha, Box, Button, Chip, Divider, IconButton, List, ListItemButton,
  Popover, Stack, Tooltip, Typography, useTheme,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../services/resource.service.js';

/**
 * The alert list behind the bell.
 *
 * Every row is a thing to do and a place to do it — clicking one navigates to
 * the screen that resolves it. An alert you cannot act on from where you are
 * standing is just a worry, so there are no dead ends here.
 */
const TONE = {
  critical: { colour: 'error', icon: <ErrorIcon fontSize="small" />, label: 'Needs attention now' },
  warning: { colour: 'warning', icon: <WarningAmberIcon fontSize="small" />, label: 'Worth looking at' },
  info: { colour: 'info', icon: <InfoOutlinedIcon fontSize="small" />, label: 'For information' },
};

export default function NotificationCentre({
  anchorEl, open, onClose, alerts = [], counts = {}, loading, onRefresh, onOpenBriefing,
}) {
  const navigate = useNavigate();
  const theme = useTheme();

  const go = (alert) => {
    onClose?.();
    if (alert.link) navigate(alert.link);
  };

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { sx: { width: { xs: 320, sm: 400 }, borderRadius: 3, mt: 1 } } }}
    >
      <Stack
        direction="row" alignItems="center" justifyContent="space-between"
        sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
      >
        <Box>
          <Typography fontWeight={800} variant="subtitle2">Needs attention</Typography>
          <Typography variant="caption" color="text.secondary">
            {counts.total
              ? `${counts.critical || 0} urgent · ${counts.warning || 0} to check`
              : 'Nothing outstanding'}
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={onRefresh} disabled={loading}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      <Box sx={{ maxHeight: 420, overflowY: 'auto' }}>
        {loading && !alerts.length ? (
          <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
            Checking…
          </Typography>
        ) : !alerts.length ? (
          <Stack alignItems="center" spacing={1} sx={{ py: 4, px: 3 }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 36, color: 'success.main' }} />
            <Typography variant="body2" fontWeight={600}>All clear</Typography>
            <Typography variant="caption" color="text.secondary" align="center">
              No stock-outs, nothing expiring, nothing waiting on you.
            </Typography>
          </Stack>
        ) : (
          <List disablePadding>
            {alerts.map((alert) => {
              const tone = TONE[alert.severity] || TONE.info;
              return (
                <ListItemButton
                  key={alert.key}
                  onClick={() => go(alert)}
                  sx={{
                    alignItems: 'flex-start',
                    gap: 1.25,
                    py: 1.25,
                    borderLeft: 3,
                    borderColor: `${tone.colour}.main`,
                    '&:hover': { bgcolor: alpha(theme.palette[tone.colour].main, 0.06) },
                  }}
                >
                  <Box sx={{ color: `${tone.colour}.main`, mt: 0.25 }}>{tone.icon}</Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" fontWeight={700} noWrap>{alert.title}</Typography>
                      <Chip
                        label={alert.count}
                        size="small"
                        color={tone.colour}
                        sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }}
                      />
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {alert.detail}
                    </Typography>
                    <Typography variant="caption" color="text.disabled">
                      {alert.category}
                    </Typography>
                  </Box>
                </ListItemButton>
              );
            })}
          </List>
        )}
      </Box>

      <Divider />
      <Box sx={{ p: 1 }}>
        <Button
          fullWidth size="small" startIcon={<TodayIcon />}
          onClick={() => { onClose?.(); onOpenBriefing?.(); }}
          sx={{ borderRadius: 2, justifyContent: 'flex-start', px: 1.5 }}
        >
          Yesterday's briefing
        </Button>
      </Box>
    </Popover>
  );
}

/** Shared by the bell so the badge and the list never disagree. */
export async function fetchAlerts() {
  return notificationsApi.alerts();
}

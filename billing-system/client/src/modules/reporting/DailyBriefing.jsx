import CloseIcon from '@mui/icons-material/Close';
import InventoryIcon from '@mui/icons-material/Inventory2';
import PaymentsIcon from '@mui/icons-material/Payments';
import ReceiptIcon from '@mui/icons-material/Receipt';
import ShoppingBasketIcon from '@mui/icons-material/ShoppingBasket';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  alpha, Box, Button, Chip, Divider, Drawer, IconButton,
  Stack, Typography, useTheme,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../services/api.js';
import { currency, date as formatDate } from '../../utils/formatters.js';

const STORAGE_KEY = 'dailyBriefingShown';
const today = () => new Date().toISOString().slice(0, 10);

/** True the first time this user opens the app on a given calendar day. */
export function shouldShowBriefing(userId) {
  if (!userId) return false;
  try {
    return localStorage.getItem(`${STORAGE_KEY}:${userId}`) !== today();
  } catch {
    return false;
  }
}

function markBriefingShown(userId) {
  try {
    localStorage.setItem(`${STORAGE_KEY}:${userId}`, today());
  } catch {
    /* private browsing — just show it again next time */
  }
}

function Metric({ icon, label, value, detail, tone = 'primary' }) {
  const theme = useTheme();
  return (
    <Stack direction="row" spacing={1.5} alignItems="center">
      <Box sx={{
        width: 38, height: 38, borderRadius: 2, flexShrink: 0,
        display: 'grid', placeItems: 'center',
        bgcolor: alpha(theme.palette[tone].main, 0.12),
        color: `${tone}.main`,
      }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography fontWeight={800} sx={{ lineHeight: 1.2 }}>{value}</Typography>
        {detail && <Typography variant="caption" color="text.secondary">{detail}</Typography>}
      </Box>
    </Stack>
  );
}

export default function DailyBriefing({ open, onClose }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api.get('/notifications/daily')
      .then((r) => { if (!cancelled) { setData(r.data); setError(''); } })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.message || 'Unable to load your summary'); });
    return () => { cancelled = true; };
  }, [open]);

  const close = () => {
    if (user?.id) markBriefingShown(user.id);
    onClose();
  };

  const go = (path) => { close(); navigate(path); };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={close}
      PaperProps={{ sx: { width: { xs: '100%', sm: 400 }, p: 0 } }}
    >
      <Stack sx={{ height: '100%' }}>
        {/* Header */}
        <Stack
          direction="row" alignItems="center" justifyContent="space-between"
          sx={{
            px: 2.5, py: 2,
            borderBottom: 1, borderColor: 'divider',
            bgcolor: alpha(theme.palette.primary.main, 0.05),
          }}
        >
          <Box>
            <Typography fontWeight={800}>Good to see you back</Typography>
            <Typography variant="caption" color="text.secondary">
              {data ? `Summary for ${formatDate(data.date)}` : 'Loading your summary…'}
            </Typography>
          </Box>
          <IconButton type="button" size="small" onClick={close}><CloseIcon fontSize="small" /></IconButton>
        </Stack>

        <Box sx={{ flex: 1, overflowY: 'auto', px: 2.5, py: 2 }}>
          {error && <Typography color="error.main" variant="body2">{error}</Typography>}

          {data && (
            <Stack spacing={2.5}>
              {/* Previous day's trading */}
              <Stack spacing={1.75}>
                <Typography variant="overline" color="text.secondary">Previous day</Typography>
                <Metric
                  icon={<ReceiptIcon fontSize="small" />} tone="primary"
                  label="Sales" value={currency(data.sales.total)}
                  detail={`${data.sales.count} invoice${data.sales.count === 1 ? '' : 's'}`
                    + (data.sales.creditCount ? ` · ${data.sales.creditCount} on credit` : '')}
                />
                <Metric
                  icon={<PaymentsIcon fontSize="small" />} tone="success"
                  label="Payments collected" value={currency(data.sales.collected)}
                />
                <Metric
                  icon={<ShoppingBasketIcon fontSize="small" />} tone="info"
                  label="Purchases" value={currency(data.purchases.total)}
                  detail={`${data.purchases.count} recorded`}
                />
                {data.returns.count > 0 && (
                  <Metric
                    icon={<ReceiptIcon fontSize="small" />} tone="warning"
                    label="Returns" value={currency(data.returns.total)}
                    detail={`${data.returns.count} credit note${data.returns.count === 1 ? '' : 's'}`}
                  />
                )}
                {data.customers.added > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    {data.customers.added} new customer{data.customers.added === 1 ? '' : 's'} added.
                  </Typography>
                )}
              </Stack>

              <Divider />

              {/* Money still owed */}
              <Stack spacing={1.5}>
                <Typography variant="overline" color="text.secondary">Outstanding</Typography>
                <Box sx={{
                  p: 1.75, borderRadius: 2, border: 1, borderColor: 'divider',
                  bgcolor: alpha(theme.palette.error.main, 0.05),
                }}>
                  <Typography variant="caption" color="text.secondary">Udhar to collect</Typography>
                  <Typography variant="h6" fontWeight={800} color="error.main">
                    {currency(data.receivables.outstanding)}
                  </Typography>
                  <Button type="button" size="small" sx={{ mt: 0.5, px: 0 }} onClick={() => go('/udhar')}>
                    Open Udhar →
                  </Button>
                </Box>
              </Stack>

              <Divider />

              {/* Stock position */}
              <Stack spacing={1.5}>
                <Typography variant="overline" color="text.secondary">Stock</Typography>
                <Metric
                  icon={<InventoryIcon fontSize="small" />} tone="secondary"
                  label="Stock on hand" value={`${data.stock.units} units`}
                  detail={`${data.stock.products} products · ${currency(data.stock.value)} at selling price`}
                />

                {data.alerts.length === 0 ? (
                  <Typography variant="body2" color="success.main" fontWeight={600}>
                    Nothing is running low.
                  </Typography>
                ) : (
                  <>
                    <Stack direction="row" spacing={1}>
                      {data.stock.outOfStockCount > 0 && (
                        <Chip size="small" color="error" label={`${data.stock.outOfStockCount} out of stock`} sx={{ fontWeight: 700 }} />
                      )}
                      {data.stock.lowStockCount > 0 && (
                        <Chip size="small" color="warning" label={`${data.stock.lowStockCount} running low`} sx={{ fontWeight: 700 }} />
                      )}
                    </Stack>

                    <Stack spacing={0.75}>
                      {data.alerts.map((alert) => (
                        <Stack
                          key={alert.productId}
                          direction="row" justifyContent="space-between" alignItems="center"
                          sx={{
                            px: 1.25, py: 0.85, borderRadius: 1.5,
                            border: 1, borderColor: 'divider',
                            bgcolor: alpha(
                              alert.severity === 'out' ? theme.palette.error.main : theme.palette.warning.main,
                              0.06,
                            ),
                          }}
                        >
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                            <WarningAmberIcon
                              sx={{ fontSize: 16, color: alert.severity === 'out' ? 'error.main' : 'warning.main', flexShrink: 0 }}
                            />
                            <Typography variant="body2" noWrap>{alert.productName}</Typography>
                          </Stack>
                          <Typography
                            variant="caption" fontWeight={700}
                            color={alert.severity === 'out' ? 'error.main' : 'warning.main'}
                            sx={{ flexShrink: 0, ml: 1 }}
                          >
                            {alert.severity === 'out' ? 'Out' : `${alert.stock} left`}
                          </Typography>
                        </Stack>
                      ))}
                    </Stack>

                    <Button type="button" size="small" variant="outlined" sx={{ borderRadius: 2 }} onClick={() => go('/inventory')}>
                      Open Inventory
                    </Button>
                  </>
                )}
              </Stack>
            </Stack>
          )}
        </Box>

        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
          <Button type="button" fullWidth variant="contained" sx={{ borderRadius: 2 }} onClick={close}>
            Start the day
          </Button>
        </Box>
      </Stack>
    </Drawer>
  );
}

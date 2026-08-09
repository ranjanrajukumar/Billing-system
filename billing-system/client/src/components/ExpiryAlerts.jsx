import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { Alert, AlertTitle, Button, Chip, Stack } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api.js';
import { currency, date } from '../utils/formatters.js';

/**
 * Seed lots that have expired or are about to. Renders nothing at all when
 * there is nothing to warn about, so a healthy dashboard stays uncluttered.
 */
export default function ExpiryAlerts({ days = 60 }) {
  const [alerts, setAlerts] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    api.get('/batches/alerts', { params: { days } })
      .then((r) => { if (!cancelled) setAlerts(r.data); })
      // A missing or failing alert feed must never take the dashboard down.
      .catch(() => { if (!cancelled) setAlerts(null); });
    return () => { cancelled = true; };
  }, [days]);

  const expired = alerts?.expired || [];
  const expiring = alerts?.expiringSoon || [];
  if (!expired.length && !expiring.length) return null;

  const severity = expired.length ? 'error' : 'warning';
  const preview = [...expired, ...expiring].slice(0, 4);

  return (
    <Alert
      severity={severity}
      icon={<WarningAmberIcon />}
      action={<Button type="button" size="small" onClick={() => navigate('/batches')}>Manage</Button>}
      sx={{ borderRadius: 3 }}
    >
      <AlertTitle sx={{ fontWeight: 700 }}>
        {expired.length > 0 && `${expired.length} expired ${expired.length === 1 ? 'lot' : 'lots'}`}
        {expired.length > 0 && expiring.length > 0 && ', '}
        {expiring.length > 0 && `${expiring.length} expiring within ${days} days`}
      </AlertTitle>
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
        {preview.map((batch) => (
          <Chip
            key={batch.id}
            size="small"
            variant="outlined"
            color={batch.status === 'Expired' ? 'error' : 'warning'}
            label={`${batch.Product?.productName || 'Lot'} · ${batch.batchNumber} · ${batch.quantity} left · ${date(batch.expiryDate)}`}
          />
        ))}
      </Stack>
      {alerts.expiredValue > 0 && (
        <Stack sx={{ mt: 0.75 }}>
          <Chip
            size="small"
            color="error"
            variant="filled"
            label={`About ${currency(alerts.expiredValue)} tied up in expired stock`}
            sx={{ alignSelf: 'flex-start', fontWeight: 700 }}
          />
        </Stack>
      )}
    </Alert>
  );
}

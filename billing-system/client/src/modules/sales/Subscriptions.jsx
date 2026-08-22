import AutorenewIcon from '@mui/icons-material/Autorenew';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import {
  Button, Card, Chip, IconButton, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography
} from '@mui/material';
import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader.jsx';
import api from '../../services/api.js';
import { useToast } from '../../context/ToastContext.jsx';
import { currency, date } from '../../utils/formatters.js';

export default function Subscriptions() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { showToast, confirmAction } = useToast();

  const load = async () => {
    try {
      const { data } = await api.get('/subscriptions');
      setSubscriptions(data.data);
    } catch (err) {
      showToast('Could not load subscriptions', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleStatus = async (sub) => {
    const newStatus = sub.status === 'Active' ? 'Paused' : 'Active';
    try {
      await api.put(`/subscriptions/${sub.id}`, { status: newStatus });
      showToast(`Subscription ${newStatus}`);
      load();
    } catch (err) {
      showToast('Could not update subscription', 'error');
    }
  };

  const removeSub = async (sub) => {
    const confirmed = await confirmAction({
      title: 'Cancel Subscription',
      text: `Are you sure you want to cancel the subscription for ${sub.Customer.customerName}?`,
      confirmText: 'Yes, Cancel'
    });
    if (!confirmed) return;
    try {
      await api.delete(`/subscriptions/${sub.id}`);
      showToast('Subscription cancelled');
      load();
    } catch (err) {
      showToast('Could not cancel subscription', 'error');
    }
  };

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Subscriptions"
        subtitle="Manage recurring billing for customers."
        icon={<AutorenewIcon />}
      >
        <Button variant="contained" startIcon={<AddIcon />} sx={{ borderRadius: 2 }}>
          New Subscription
        </Button>
      </PageHeader>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Customer</TableCell>
                <TableCell>Product</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Frequency</TableCell>
                <TableCell>Next Billing</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} align="center">Loading...</TableCell></TableRow>
              ) : subscriptions.length === 0 ? (
                <TableRow><TableCell colSpan={7} align="center">No subscriptions found</TableCell></TableRow>
              ) : (
                subscriptions.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{sub.Customer?.customerName}</Typography>
                      <Typography variant="caption" color="text.secondary">{sub.Customer?.phone}</Typography>
                    </TableCell>
                    <TableCell>{sub.Product?.productName}</TableCell>
                    <TableCell fontWeight={600}>{currency(sub.amount)}</TableCell>
                    <TableCell>{sub.frequency}</TableCell>
                    <TableCell>{date(sub.nextBillingDate)}</TableCell>
                    <TableCell>
                      <Chip
                        label={sub.status} size="small"
                        color={sub.status === 'Active' ? 'success' : sub.status === 'Paused' ? 'warning' : 'error'}
                      />
                    </TableCell>
                    <TableCell align="right">
                      {sub.status !== 'Cancelled' && (
                        <>
                          <Tooltip title={sub.status === 'Active' ? 'Pause' : 'Resume'}>
                            <IconButton onClick={() => toggleStatus(sub)}>
                              {sub.status === 'Active' ? <PauseIcon /> : <PlayArrowIcon />}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Cancel">
                            <IconButton color="error" onClick={() => removeSub(sub)}>
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Stack>
  );
}

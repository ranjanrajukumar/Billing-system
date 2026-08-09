import BackspaceIcon from '@mui/icons-material/Backspace';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {
  alpha, Box, Button, Dialog, DialogContent, DialogTitle,
  Grid, IconButton, MenuItem, Stack, Tab, Tabs, TextField, Tooltip, Typography, useTheme,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { currency } from '../utils/formatters.js';
import { applyKey, gstBreakdown, initialState, OPERATORS } from '../utils/calculator.js';

const GST_RATES = [0, 3, 5, 12, 18, 28];

// Keys the calculator understands, so keyboard and buttons stay in step.
const KEYPAD = [
  ['C', '⌫', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '−'],
  ['1', '2', '3', '+'],
  ['0', '.', '±', '='],
];

function StandardCalculator() {
  const theme = useTheme();
  const [state, dispatch] = useReducer(applyKey, initialState);
  const { display, history } = state;
  const press = useCallback((key) => dispatch(key), []);
  const { showToast } = useToast();

  useEffect(() => {
    const KEY_MAP = {
      '/': '÷', '*': '×', '-': '−', '+': '+', '=': '=', Enter: '=',
      Backspace: '⌫', Escape: 'C', '%': '%', '.': '.', ',': '.',
    };
    const onKeyDown = (event) => {
      const key = /^[0-9]$/.test(event.key) ? event.key : KEY_MAP[event.key];
      if (!key) return;
      event.preventDefault();
      press(key);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [press]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(display);
      showToast('Result copied');
    } catch {
      showToast('Clipboard unavailable', 'error');
    }
  };

  return (
    <Stack spacing={1.5}>
      <Box sx={{
        p: 2, borderRadius: 2, textAlign: 'right',
        bgcolor: alpha(theme.palette.primary.main, 0.06),
        border: 1, borderColor: 'divider',
      }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', minHeight: 18 }}>
          {history || ' '}
        </Typography>
        <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={1}>
          <Typography variant="h4" fontWeight={700} sx={{ wordBreak: 'break-all' }}>{display}</Typography>
          <Tooltip title="Copy result">
            <IconButton size="small" onClick={copy}><ContentCopyIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Stack>
      </Box>

      <Grid container spacing={1}>
        {KEYPAD.flat().map((key) => {
          const isOperator = Boolean(OPERATORS[key]) || key === '=';
          const isAction = ['C', '⌫', '%', '±'].includes(key);
          return (
            <Grid item xs={3} key={key}>
              <Button
                fullWidth
                onClick={() => press(key)}
                variant={key === '=' ? 'contained' : 'outlined'}
                color={isOperator ? 'primary' : isAction ? 'warning' : 'inherit'}
                sx={{ borderRadius: 2, py: 1.25, fontSize: '1.05rem', fontWeight: 700 }}
              >
                {key === '⌫' ? <BackspaceIcon fontSize="small" /> : key}
              </Button>
            </Grid>
          );
        })}
      </Grid>
      <Typography variant="caption" color="text.secondary" textAlign="center">
        Keyboard works too — digits, + − × ÷, Enter, Backspace, Esc
      </Typography>
    </Stack>
  );
}

function GstCalculator() {
  const theme = useTheme();
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState(18);
  const [mode, setMode] = useState('exclusive');

  const result = useMemo(() => gstBreakdown(amount, rate, mode), [amount, rate, mode]);

  const rows = [
    { label: 'Taxable value', value: result.base },
    { label: `CGST (${Number(rate) / 2}%)`, value: result.gst / 2 },
    { label: `SGST (${Number(rate) / 2}%)`, value: result.gst / 2 },
    { label: `Total GST (${rate}%)`, value: result.gst },
  ];

  return (
    <Stack spacing={2}>
      <Grid container spacing={1.5}>
        <Grid item xs={12} sm={5}>
          <TextField
            fullWidth size="small" label="Amount" type="number" autoFocus
            inputProps={{ min: 0, step: 'any' }}
            value={amount} onChange={(e) => setAmount(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <TextField
            select fullWidth size="small" label="GST %"
            value={rate} onChange={(e) => setRate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          >
            {GST_RATES.map((r) => <MenuItem key={r} value={r}>{r}%</MenuItem>)}
          </TextField>
        </Grid>
        <Grid item xs={6} sm={4}>
          <TextField
            select fullWidth size="small" label="Amount is"
            value={mode} onChange={(e) => setMode(e.target.value)}
            InputLabelProps={{ shrink: true }}
          >
            <MenuItem value="exclusive">Before GST</MenuItem>
            <MenuItem value="inclusive">GST inclusive</MenuItem>
          </TextField>
        </Grid>
      </Grid>

      <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: 'divider', bgcolor: alpha(theme.palette.primary.main, 0.04) }}>
        <Stack spacing={0.75}>
          {rows.map((row) => (
            <Stack key={row.label} direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">{row.label}</Typography>
              <Typography variant="body2" fontWeight={600}>{currency(row.value)}</Typography>
            </Stack>
          ))}
          <Stack direction="row" justifyContent="space-between" sx={{ pt: 1, borderTop: 1, borderColor: 'divider' }}>
            <Typography fontWeight={800}>Total payable</Typography>
            <Typography fontWeight={800} color="primary.main">{currency(result.total)}</Typography>
          </Stack>
        </Stack>
      </Box>

      <Typography variant="caption" color="text.secondary">
        CGST/SGST split shown for an in-state sale. For inter-state, the same total is charged as IGST.
      </Typography>
    </Stack>
  );
}

export default function CalculatorDialog({ open, onClose }) {
  const [tab, setTab] = useState(0);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 0 }}>Calculator</DialogTitle>
      <Tabs value={tab} onChange={(_e, next) => setTab(next)} sx={{ px: 3 }}>
        <Tab label="Standard" />
        <Tab label="GST" />
      </Tabs>
      <DialogContent>
        {tab === 0 ? <StandardCalculator /> : <GstCalculator />}
      </DialogContent>
    </Dialog>
  );
}

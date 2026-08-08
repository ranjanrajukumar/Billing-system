import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  alpha,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';

export default function ConfirmDialog({ open, message, onCancel, onConfirm, title = 'Confirm Action' }) {
  const theme = useTheme();

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="xs"
      fullWidth
      sx={{
        '& .MuiDialog-paper': { borderRadius: 3 },
        '& .MuiBackdrop-root': {
          backdropFilter: 'blur(4px)',
          backgroundColor: alpha('#000', 0.4),
        },
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Stack
            alignItems="center"
            justifyContent="center"
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.error.main, 0.1),
              color: 'error.main',
              flexShrink: 0,
            }}
          >
            <WarningAmberIcon fontSize="small" />
          </Stack>
          <Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>{title}</Typography>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
          {message}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button
          onClick={onCancel}
          variant="outlined"
          sx={{
            borderRadius: 2,
            color: 'text.secondary',
            borderColor: 'divider',
            '&:hover': { borderColor: 'text.secondary' },
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          color="error"
          sx={{
            borderRadius: 2,
            background: `linear-gradient(135deg, ${theme.palette.error.main} 0%, ${theme.palette.error.dark} 100%)`,
            boxShadow: `0 4px 14px ${alpha(theme.palette.error.main, 0.4)}`,
          }}
        >
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
}

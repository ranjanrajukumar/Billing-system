import CloseIcon from '@mui/icons-material/Close';
import {
  alpha,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  useMediaQuery,
  useTheme,
} from '@mui/material';

export default function Modal({ open, title, onClose, children, maxWidth = 'md' }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth={maxWidth}
      fullScreen={fullScreen}
      scroll="paper"
      sx={{
        '& .MuiDialog-paper': {
          borderRadius: fullScreen ? 0 : 3,
          ...(fullScreen && {
            m: 0,
            maxHeight: '100%',
          }),
        },
        '& .MuiBackdrop-root': {
          backdropFilter: 'blur(4px)',
          backgroundColor: alpha('#000', 0.45),
        },
      }}
    >
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
          <span>{title}</span>
          <IconButton
            onClick={onClose}
            aria-label="close"
            size="small"
            sx={{
              bgcolor: alpha(theme.palette.action.hover, 0.8),
              borderRadius: 1.5,
              width: 30,
              height: 30,
              flexShrink: 0,
              '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.12), color: 'error.main' },
            }}
          >
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, py: 2.5 }}>
        {children}
      </DialogContent>
    </Dialog>
  );
}

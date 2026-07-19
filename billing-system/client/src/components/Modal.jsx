import CloseIcon from '@mui/icons-material/Close';
import { Dialog, DialogContent, DialogTitle, IconButton, Stack } from '@mui/material';

export default function Modal({ open, title, onClose, children, maxWidth = 'md' }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth={maxWidth}>
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          {title}
          <IconButton onClick={onClose} aria-label="close"><CloseIcon /></IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent>{children}</DialogContent>
    </Dialog>
  );
}

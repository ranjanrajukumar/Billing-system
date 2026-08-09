import LockIcon from '@mui/icons-material/Lock';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { canOpen } from '../utils/access.js';

/**
 * Guards a route by role. Hiding the sidebar entry is not enough on its own —
 * the URL can still be typed — so this renders an explanation rather than a
 * page full of failed requests.
 */
export default function RoleRoute({ children }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  if (canOpen(pathname, user?.role, user?.menus)) return children;

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, p: 4, textAlign: 'center' }}>
      <Stack spacing={2} alignItems="center">
        <Box sx={{
          width: 56, height: 56, borderRadius: '50%',
          display: 'grid', placeItems: 'center',
          bgcolor: 'action.hover', color: 'text.secondary',
        }}>
          <LockIcon />
        </Box>
        <Box>
          <Typography variant="h6" fontWeight={800}>This page needs a different role</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            You are signed in as <strong>{user?.role || 'unknown'}</strong>. Users, roles and audit
            logs are Admin-only; reports need Admin or Accountant.
          </Typography>
        </Box>
        <Button variant="contained" sx={{ borderRadius: 2 }} onClick={() => navigate('/')}>
          Back to Dashboard
        </Button>
      </Stack>
    </Paper>
  );
}

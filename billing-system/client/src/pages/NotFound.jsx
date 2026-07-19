import { Button, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <Stack spacing={2} sx={{ minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <Typography variant="h3">404</Typography>
      <Typography color="text.secondary">Page not found</Typography>
      <Button component={Link} to="/" variant="contained">Go to Dashboard</Button>
    </Stack>
  );
}

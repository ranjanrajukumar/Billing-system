import { Card, CardContent, Stack, Typography } from '@mui/material';
import { useAuth } from '../context/AuthContext.jsx';

export default function Profile() {
  const { user } = useAuth();
  return (
    <Stack spacing={2}>
      <Typography variant="h4">Profile</Typography>
      <Card variant="outlined"><CardContent><Typography variant="h6">{user?.name}</Typography><Typography>{user?.email}</Typography><Typography color="text.secondary">{user?.role}</Typography></CardContent></Card>
    </Stack>
  );
}

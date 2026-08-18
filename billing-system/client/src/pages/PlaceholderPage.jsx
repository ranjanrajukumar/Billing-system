import { Box, Typography } from '@mui/material';

export default function PlaceholderPage({ title }) {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4">{title}</Typography>
      <Typography sx={{ mt: 2 }} color="text.secondary">
        This module is currently under development. Check back later!
      </Typography>
    </Box>
  );
}

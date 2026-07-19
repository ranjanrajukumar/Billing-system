import { Box, Typography } from '@mui/material';

export default function Footer() {
  return <Box sx={{ py: 2 }}><Typography color="text.secondary" variant="caption">(c) {new Date().getFullYear()} Billing System</Typography></Box>;
}

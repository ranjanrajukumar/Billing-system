import { alpha, Box, Stack, Typography, useTheme } from '@mui/material';
import StorefrontIcon from '@mui/icons-material/Storefront';

export default function Footer() {
  const theme = useTheme();
  return (
    <Box
      component="footer"
      sx={{
        mt: 6,
        pt: 3,
        borderTop: `1px solid ${alpha(theme.palette.divider, 1)}`,
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center">
        <StorefrontIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
        <Typography variant="caption" color="text.disabled" fontWeight={600}>
          ShopBill Pro
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.disabled">
        © {new Date().getFullYear()} All rights reserved. Built for modern retail.
      </Typography>
    </Box>
  );
}

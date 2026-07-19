import { Box, CircularProgress } from '@mui/material';

export default function Loader() {
  return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 240 }}><CircularProgress /></Box>;
}

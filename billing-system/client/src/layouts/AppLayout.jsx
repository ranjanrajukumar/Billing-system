import { Box, Container } from '@mui/material';
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Footer from '../components/Footer.jsx';
import Navbar from '../components/Navbar.jsx';
import Sidebar from '../components/Sidebar.jsx';

export default function AppLayout({ mode, onToggleMode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', m: { xs: 0, md: 2 }, ml: { xs: 0, md: 0 }, borderRadius: { xs: 0, md: 3 }, overflow: 'hidden', bgcolor: 'background.paper', boxShadow: { xs: 0, md: 1 } }}>
        <Navbar onMenu={() => setMobileOpen(true)} mode={mode} onToggleMode={onToggleMode} />
        <Container maxWidth="xl" sx={{ py: 3 }}>
          <Outlet />
          <Footer />
        </Container>
      </Box>
    </Box>
  );
}

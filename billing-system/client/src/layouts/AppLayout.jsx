import { Box } from '@mui/material';
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from '../components/Navbar.jsx';
import Sidebar from '../components/Sidebar.jsx';
import MobileBottomNav from '../components/MobileBottomNav.jsx';

export default function AppLayout({ mode, onToggleMode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Sidebar — permanent variant adds its own flex-width; temporary is overlay */}
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Main content — flexGrow:1 fills the rest after the sidebar's flex-width */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Navbar
          onMenu={() => setMobileOpen(true)}
          mode={mode}
          onToggleMode={onToggleMode}
        />

        {/* Page content */}
        <Box
          sx={{
            flexGrow: 1,
            px: { xs: 2, sm: 3 },
            py: { xs: 2, sm: 3 },
            // Extra bottom padding on mobile for bottom nav
            pb: { xs: '88px', sm: 3 },
            maxWidth: '100%',
            boxSizing: 'border-box',
          }}
        >
          <Outlet />
        </Box>
      </Box>

      {/* Mobile bottom navigation */}
      <MobileBottomNav onOpenSidebar={() => setMobileOpen(true)} />
    </Box>
  );
}

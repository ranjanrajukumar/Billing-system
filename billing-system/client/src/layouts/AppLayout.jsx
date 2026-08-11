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
          // minWidth:0 stops a wide child stretching the flex column. Do NOT add
          // overflow:hidden here — it makes this a scroll container, which breaks
          // the Navbar's position:sticky and lets the header scroll away.
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
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
            px: { xs: 1.5, sm: 3 },
            py: { xs: 2, sm: 3 },
            // Extra bottom padding on mobile for bottom nav + safe area
            pb: { xs: 'calc(88px + env(safe-area-inset-bottom, 0px))', sm: 3 },
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

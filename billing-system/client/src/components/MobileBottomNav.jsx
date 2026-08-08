import DashboardIcon from '@mui/icons-material/Dashboard';
import InventoryIcon from '@mui/icons-material/Inventory2';
import ReceiptIcon from '@mui/icons-material/Receipt';
import PeopleIcon from '@mui/icons-material/People';
import MenuIcon from '@mui/icons-material/Menu';
import { BottomNavigation, BottomNavigationAction, Paper, alpha } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

const navItems = [
  { label: 'Dashboard', icon: <DashboardIcon />, path: '/' },
  { label: 'Products', icon: <InventoryIcon />, path: '/products' },
  { label: 'Invoices', icon: <ReceiptIcon />, path: '/invoices' },
  { label: 'Customers', icon: <PeopleIcon />, path: '/customers' },
  { label: 'More', icon: <MenuIcon />, path: null },
];

export default function MobileBottomNav({ onOpenSidebar }) {
  const location = useLocation();
  const navigate = useNavigate();

  const getActiveIndex = () => {
    const idx = navItems.findIndex(
      (item) => item.path && item.path !== '/' && location.pathname.startsWith(item.path)
    );
    if (idx !== -1) return idx;
    if (location.pathname === '/') return 0;
    return false;
  };

  const [value, setValue] = useState(getActiveIndex());
  useEffect(() => { setValue(getActiveIndex()); }, [location.pathname]);

  const handleChange = (_, newValue) => {
    const item = navItems[newValue];
    if (item.path === null) {
      onOpenSidebar?.();
    } else {
      navigate(item.path);
      setValue(newValue);
    }
  };

  return (
    <Paper
      elevation={0}
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1200,
        display: { xs: 'block', md: 'none' },
        borderTop: (theme) => `1px solid ${alpha(theme.palette.divider, 1)}`,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        background: (theme) =>
          theme.palette.mode === 'dark'
            ? alpha('#1a1a2e', 0.95)
            : alpha('#ffffff', 0.95),
      }}
    >
      <BottomNavigation
        value={value}
        onChange={handleChange}
        sx={{
          background: 'transparent',
          height: 64,
          '& .MuiBottomNavigationAction-root': {
            minWidth: 0,
            fontSize: '0.68rem',
            fontWeight: 600,
            color: 'text.secondary',
            transition: 'color 0.2s, transform 0.2s',
            '&.Mui-selected': {
              color: 'primary.main',
              '& .MuiSvgIcon-root': {
                transform: 'translateY(-2px)',
              },
            },
          },
          '& .MuiBottomNavigationAction-label': {
            fontSize: '0.68rem',
            fontWeight: 600,
            '&.Mui-selected': { fontSize: '0.68rem' },
          },
        }}
      >
        {navItems.map((item) => (
          <BottomNavigationAction
            key={item.label}
            label={item.label}
            icon={item.icon}
          />
        ))}
      </BottomNavigation>
    </Paper>
  );
}

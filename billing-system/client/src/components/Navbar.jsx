import CalculateIcon from '@mui/icons-material/Calculate';
import NotificationsIcon from '@mui/icons-material/Notifications';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import PersonIcon from '@mui/icons-material/Person';
import StorefrontIcon from '@mui/icons-material/Storefront';
import {
  alpha,
  AppBar,
  Avatar,
  Box,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { mediaUrl } from '../utils/formatters.js';
import CalculatorDialog from './CalculatorDialog.jsx';
import DailyBriefing, { shouldShowBriefing } from './DailyBriefing.jsx';
import BranchSwitcher from './BranchSwitcher.jsx';

export default function Navbar({ onMenu, mode, onToggleMode }) {
  const { user, logout } = useAuth();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState(null);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);

  // Opens by itself the first time this user loads the app on a given day.
  useEffect(() => {
    if (user?.id && shouldShowBriefing(user.id)) setBriefingOpen(true);
  }, [user?.id]);

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <AppBar position="sticky" elevation={0}>
      <Toolbar sx={{ gap: 1, minHeight: { xs: 56, sm: 64 } }}>
        {/* Mobile menu toggle */}
        <IconButton
          edge="start"
          onClick={onMenu}
          sx={{
            display: { md: 'none' },
            color: 'text.secondary',
            bgcolor: alpha(theme.palette.primary.main, 0.07),
            borderRadius: 2,
            width: 36,
            height: 36,
            '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.12) },
          }}
        >
          <MenuIcon fontSize="small" />
        </IconButton>

        {/* Mobile brand */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ display: { md: 'none' }, flex: 1 }}
          component={RouterLink}
          to="/"
        >
          <Box
            sx={{
              width: 30,
              height: 30,
              borderRadius: 1.5,
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <StorefrontIcon sx={{ fontSize: 16 }} />
          </Box>
          <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: '-0.01em' }}>
            ShopBill Pro
          </Typography>
        </Stack>

        {/* Desktop spacer */}
        <Box sx={{ flex: 1, display: { xs: 'none', md: 'block' } }} />

        {/* Right section */}
        <Stack direction="row" alignItems="center" spacing={{ xs: 0.25, sm: 0.5 }}>
          <Box sx={{ display: { xs: 'none', sm: 'block' }, mr: 0.5 }}>
            <BranchSwitcher />
          </Box>

          {/* Daily summary */}
          <Tooltip title="Daily summary">
            <IconButton
              onClick={() => setBriefingOpen(true)}
              size="small"
              sx={{
                color: 'text.secondary',
                bgcolor: alpha(theme.palette.primary.main, 0.06),
                borderRadius: 2,
                width: { xs: 30, sm: 34 },
                height: { xs: 30, sm: 34 },
                transition: 'all 0.2s',
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.12) },
              }}
            >
              <NotificationsIcon sx={{ fontSize: { xs: 16, sm: 18 } }} />
            </IconButton>
          </Tooltip>

          {/* Calculator */}
          <Tooltip title="Calculator">
            <IconButton
              onClick={() => setCalculatorOpen(true)}
              size="small"
              sx={{
                color: 'text.secondary',
                bgcolor: alpha(theme.palette.primary.main, 0.06),
                borderRadius: 2,
                width: { xs: 30, sm: 34 },
                height: { xs: 30, sm: 34 },
                transition: 'all 0.2s',
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.12) },
              }}
            >
              <CalculateIcon sx={{ fontSize: { xs: 16, sm: 18 } }} />
            </IconButton>
          </Tooltip>

          {/* Theme toggle */}
          <Tooltip title={mode === 'dark' ? 'Light mode' : 'Dark mode'}>
            <IconButton
              onClick={onToggleMode}
              size="small"
              sx={{
                color: 'text.secondary',
                bgcolor: alpha(theme.palette.primary.main, 0.06),
                borderRadius: 2,
                width: { xs: 30, sm: 34 },
                height: { xs: 30, sm: 34 },
                transition: 'all 0.2s',
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.12),
                  transform: 'rotate(20deg)',
                },
              }}
            >
              {mode === 'dark' ? (
                <LightModeIcon sx={{ fontSize: { xs: 16, sm: 18 } }} />
              ) : (
                <DarkModeIcon sx={{ fontSize: { xs: 16, sm: 18 } }} />
              )}
            </IconButton>
          </Tooltip>

          {/* User avatar menu */}
          <Tooltip title="Account">
            <Box
              onClick={(e) => setAnchorEl(e.currentTarget)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                cursor: 'pointer',
                borderRadius: 2.5,
                px: 1,
                py: 0.5,
                transition: 'all 0.15s',
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.06),
                },
              }}
            >
              <Avatar
                src={mediaUrl(user?.profileImageUrl)}
                alt={user?.name}
                sx={{
                  width: 32,
                  height: 32,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                }}
              >
                {initials}
              </Avatar>
              <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, lineHeight: 1.2 }}>
                  {user?.name}
                </Typography>
                <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', lineHeight: 1.2 }}>
                  {user?.role || 'User'}
                </Typography>
              </Box>
            </Box>
          </Tooltip>
        </Stack>
      </Toolbar>

      {/* User dropdown menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        slotProps={{
          paper: {
            elevation: 3,
            sx: {
              borderRadius: 2.5,
              minWidth: 200,
              mt: 0.5,
              border: `1px solid ${isDark ? alpha('#fff', 0.08) : alpha('#000', 0.06)}`,
              overflow: 'visible',
              '&::before': {
                content: '""',
                display: 'block',
                position: 'absolute',
                top: 0,
                right: 14,
                width: 10,
                height: 10,
                bgcolor: 'background.paper',
                transform: 'translateY(-50%) rotate(45deg)',
                zIndex: 0,
                borderTop: `1px solid ${isDark ? alpha('#fff', 0.08) : alpha('#000', 0.06)}`,
                borderLeft: `1px solid ${isDark ? alpha('#fff', 0.08) : alpha('#000', 0.06)}`,
              },
            },
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>{user?.name}</Typography>
          <Typography variant="caption" color="text.secondary">{user?.email}</Typography>
        </Box>
        <Divider sx={{ opacity: 0.6 }} />
        <MenuItem
          onClick={() => { setAnchorEl(null); navigate('/profile'); }}
          sx={{ gap: 1.5, py: 1.25, borderRadius: 1.5, mx: 0.5, mt: 0.5 }}
        >
          <ListItemIcon sx={{ minWidth: 'auto' }}>
            <PersonIcon fontSize="small" />
          </ListItemIcon>
          Profile
        </MenuItem>
        <MenuItem
          onClick={() => { setAnchorEl(null); logout(); }}
          sx={{
            gap: 1.5,
            py: 1.25,
            borderRadius: 1.5,
            mx: 0.5,
            mb: 0.5,
            color: 'error.main',
            '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.08) },
          }}
        >
          <ListItemIcon sx={{ minWidth: 'auto', color: 'error.main' }}>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          Logout
        </MenuItem>
      </Menu>

      <CalculatorDialog open={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
      <DailyBriefing open={briefingOpen} onClose={() => setBriefingOpen(false)} />
    </AppBar>
  );
}

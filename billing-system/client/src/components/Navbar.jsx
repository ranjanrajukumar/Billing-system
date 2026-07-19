import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import { AppBar, IconButton, Stack, Toolbar, Tooltip, Typography } from '@mui/material';
import { useAuth } from '../context/AuthContext.jsx';

export default function Navbar({ onMenu, mode, onToggleMode }) {
  const { user, logout } = useAuth();
  return (
    <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Toolbar>
        <IconButton edge="start" onClick={onMenu} sx={{ mr: 1, display: { md: 'none' } }}><MenuIcon /></IconButton>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>Billing System</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" color="text.secondary">{user?.name}</Typography>
          <Tooltip title="Toggle theme">
            <IconButton onClick={onToggleMode}>{mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}</IconButton>
          </Tooltip>
          <Tooltip title="Logout">
            <IconButton onClick={logout}><LogoutIcon /></IconButton>
          </Tooltip>
        </Stack>
      </Toolbar>
    </AppBar>
  );
}

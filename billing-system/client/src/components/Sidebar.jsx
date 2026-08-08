import AssessmentIcon from '@mui/icons-material/Assessment';
import DashboardIcon from '@mui/icons-material/Dashboard';
import InventoryIcon from '@mui/icons-material/Inventory2';
import CategoryIcon from '@mui/icons-material/Category';
import ListAltIcon from '@mui/icons-material/ListAlt';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptIcon from '@mui/icons-material/Receipt';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import SettingsIcon from '@mui/icons-material/Settings';
import PersonIcon from '@mui/icons-material/Person';
import GroupIcon from '@mui/icons-material/Group';
import ArticleIcon from '@mui/icons-material/Article';
import StorefrontIcon from '@mui/icons-material/Storefront';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
  alpha,
  Box,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
  useTheme,
} from '@mui/material';
import { NavLink } from 'react-router-dom';

const DRAWER_WIDTH = 256;

const navGroups = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', path: '/', icon: <DashboardIcon fontSize="small" /> },
    ],
  },
  {
    label: 'Sales',
    items: [
      { label: 'Invoices', path: '/invoices', icon: <ReceiptIcon fontSize="small" /> },
      { label: 'Sales Orders', path: '/sales-orders', icon: <ShoppingCartIcon fontSize="small" /> },
      { label: 'Customers', path: '/customers', icon: <PeopleIcon fontSize="small" /> },
      { label: 'Reports', path: '/reports', icon: <AssessmentIcon fontSize="small" /> },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { label: 'Products', path: '/products', icon: <CategoryIcon fontSize="small" /> },
      { label: 'Inventory', path: '/inventory', icon: <InventoryIcon fontSize="small" /> },
      { label: 'Masters', path: '/masters', icon: <ListAltIcon fontSize="small" /> },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Users & Roles', path: '/users', icon: <GroupIcon fontSize="small" /> },
      { label: 'Invoice Templates', path: '/invoice-templates', icon: <ArticleIcon fontSize="small" /> },
      { label: 'Settings', path: '/settings', icon: <SettingsIcon fontSize="small" /> },
      { label: 'Profile', path: '/profile', icon: <PersonIcon fontSize="small" /> },
    ],
  },
];

function NavItem({ label, path, icon, onClose }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <ListItemButton
      component={NavLink}
      to={path}
      end={path === '/'}
      onClick={onClose}
      sx={{
        borderRadius: '10px',
        px: 1.5,
        py: 0.9,
        mb: 0.25,
        color: 'text.secondary',
        '&.active': {
          bgcolor: isDark
            ? alpha(theme.palette.primary.main, 0.2)
            : alpha(theme.palette.primary.main, 0.09),
          color: 'primary.main',
          '& .MuiListItemIcon-root': {
            color: 'primary.main',
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            right: 8,
            width: 6,
            height: 6,
            borderRadius: '50%',
            bgcolor: 'primary.main',
          },
        },
        '&:hover': {
          bgcolor: isDark
            ? alpha('#ffffff', 0.05)
            : alpha(theme.palette.primary.main, 0.05),
          color: 'text.primary',
        },
        transition: 'all 0.15s ease',
        position: 'relative',
      }}
    >
      <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}>{icon}</ListItemIcon>
      <ListItemText
        primary={label}
        primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500 }}
      />
    </ListItemButton>
  );
}

function SidebarContent({ onClose }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box sx={{ width: DRAWER_WIDTH, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Brand Header */}
      <Box
        sx={{
          px: 2.5,
          py: 2.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          borderBottom: `1px solid ${isDark ? alpha('#ffffff', 0.06) : alpha('#4f46e5', 0.08)}`,
          flexShrink: 0,
        }}
      >
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: 2,
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            flexShrink: 0,
            boxShadow: '0 4px 14px rgba(79,70,229,0.4)',
          }}
        >
          <StorefrontIcon fontSize="small" />
        </Box>
        <Box>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: '1rem',
              lineHeight: 1.2,
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            ShopBill Pro
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
            Inventory & Billing
          </Typography>
        </Box>
      </Box>

      {/* Nav Groups */}
      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', px: 1.5, py: 1.5 }}>
        {navGroups.map((group, gi) => (
          <Box key={group.label} sx={{ mb: 1.5 }}>
            <Typography
              variant="caption"
              sx={{
                px: 1,
                mb: 0.5,
                display: 'block',
                fontWeight: 700,
                fontSize: '0.68rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'text.disabled',
              }}
            >
              {group.label}
            </Typography>
            <List disablePadding>
              {group.items.map((item) => (
                <NavItem key={item.path} {...item} onClose={onClose} />
              ))}
            </List>
            {gi < navGroups.length - 1 && (
              <Divider sx={{ mt: 1.5, opacity: 0.5 }} />
            )}
          </Box>
        ))}
      </Box>

      {/* Footer */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderTop: `1px solid ${isDark ? alpha('#ffffff', 0.06) : alpha('#000000', 0.06)}`,
          flexShrink: 0,
        }}
      >
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.7rem' }}>
          ShopBill Pro v2.0 • All rights reserved
        </Typography>
      </Box>
    </Box>
  );
}

export default function Sidebar({ mobileOpen, onClose }) {
  return (
    <>
      {/* Mobile drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            border: 'none',
          },
        }}
      >
        <SidebarContent onClose={onClose} />
      </Drawer>

      {/* Desktop permanent drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            border: 'none',
          },
        }}
        open
      >
        <SidebarContent />
      </Drawer>
    </>
  );
}

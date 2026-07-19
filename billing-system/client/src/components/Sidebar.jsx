import AssessmentIcon from '@mui/icons-material/Assessment';
import DashboardIcon from '@mui/icons-material/Dashboard';
import InventoryIcon from '@mui/icons-material/Inventory';
import CategoryIcon from '@mui/icons-material/Category';
import ListAltIcon from '@mui/icons-material/ListAlt';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptIcon from '@mui/icons-material/Receipt';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import SettingsIcon from '@mui/icons-material/Settings';
import PersonIcon from '@mui/icons-material/Person';
import GroupIcon from '@mui/icons-material/Group';
import { Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Toolbar } from '@mui/material';
import { NavLink } from 'react-router-dom';

const width = 248;
const items = [
  ['Dashboard', '/', <DashboardIcon />],
  ['Masters', '/masters', <ListAltIcon />],
  ['Customers', '/customers', <PeopleIcon />],
  ['Products', '/products', <CategoryIcon />],
  ['Inventory', '/inventory', <InventoryIcon />],
  ['Invoices', '/invoices', <ReceiptIcon />],
  ['Sales Orders', '/sales-orders', <ShoppingCartIcon />],
  ['Users & Roles', '/users', <GroupIcon />],
  ['Settings', '/settings', <SettingsIcon />],
  ['Invoice Format Setup', '/invoice-templates', <SettingsIcon />],
  ['Profile', '/profile', <PersonIcon />]
];

function Content({ onClose }) {
  return (
    <Box sx={{ width, overflowX: 'hidden' }}>
      <Toolbar />
      <List sx={{ px: 1 }}>
        {items.map(([label, to, icon]) => (
          <ListItemButton key={to} component={NavLink} to={to} onClick={onClose} sx={{ borderRadius: 1, mb: 0.5, '&.active': { bgcolor: 'primary.main', color: 'primary.contrastText' } }}>
            <ListItemIcon sx={{ color: 'inherit' }}>{icon}</ListItemIcon>
            <ListItemText primary={label} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}

export default function Sidebar({ mobileOpen, onClose }) {
  return (
    <>
      <Drawer variant="temporary" open={mobileOpen} onClose={onClose} sx={{ display: { xs: 'block', md: 'none' } }}><Content onClose={onClose} /></Drawer>
      <Drawer variant="permanent" open sx={{ display: { xs: 'none', md: 'block' }, width: width + 32, flexShrink: 0, '& .MuiDrawer-paper': { width, boxSizing: 'border-box', borderRight: 'none', m: 2, height: 'calc(100% - 32px)', borderRadius: 3, boxShadow: 1 } }}><Content /></Drawer>
    </>
  );
}

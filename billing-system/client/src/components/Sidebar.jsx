import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ArticleIcon from '@mui/icons-material/Article';
import AssessmentIcon from '@mui/icons-material/Assessment';
import AssignmentIcon from '@mui/icons-material/Assignment';
import BoltIcon from '@mui/icons-material/Bolt';
import CategoryIcon from '@mui/icons-material/Category';
import DashboardIcon from '@mui/icons-material/Dashboard';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import ForkliftIcon from '@mui/icons-material/PrecisionManufacturing';
import GroupIcon from '@mui/icons-material/Group';
import HistoryIcon from '@mui/icons-material/History';
import InventoryIcon from '@mui/icons-material/Inventory2';
import KeyboardReturnIcon from '@mui/icons-material/KeyboardReturn';
import ListAltIcon from '@mui/icons-material/ListAlt';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import MoveToInboxIcon from '@mui/icons-material/MoveToInbox';
import PaymentsIcon from '@mui/icons-material/Payments';
import PeopleIcon from '@mui/icons-material/People';
import PersonIcon from '@mui/icons-material/Person';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import ReceiptIcon from '@mui/icons-material/Receipt';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import ScienceIcon from '@mui/icons-material/Science';
import SettingsIcon from '@mui/icons-material/Settings';
import ShoppingBasketIcon from '@mui/icons-material/ShoppingBasket';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import StorageIcon from '@mui/icons-material/Storage';
import StoreIcon from '@mui/icons-material/Store';
import StorefrontIcon from '@mui/icons-material/Storefront';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import TuneIcon from '@mui/icons-material/Tune';
import UndoIcon from '@mui/icons-material/Undo';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import BuildIcon from '@mui/icons-material/Build';
import {
  alpha,
  Box,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  useTheme,
} from '@mui/material';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

import AutorenewIcon from '@mui/icons-material/Autorenew';

const DRAWER_WIDTH = 256;

/**
 * The one thing the sidebar still decides for itself.
 *
 * Grouping, labels, ordering and which pages a user may see all come from the
 * server with the signed-in user — this used to be a second copy of the menu
 * kept in step by hand, which is exactly the sort of list that drifts. An icon
 * is a presentation choice, so it stays here; everything else does not.
 */
const ICONS = {
  dashboard: <DashboardIcon fontSize="small" />,

  quickBill: <BoltIcon fontSize="small" />,
  invoices: <ReceiptIcon fontSize="small" />,
  subscriptions: <AutorenewIcon fontSize="small" />,
  salesOrders: <ShoppingCartIcon fontSize="small" />,
  quotations: <RequestQuoteIcon fontSize="small" />,
  deliveryChallans: <LocalShippingIcon fontSize="small" />,
  salesReturns: <KeyboardReturnIcon fontSize="small" />,
  customers: <PeopleIcon fontSize="small" />,
  udhar: <AccountBalanceWalletIcon fontSize="small" />,
  khata: <MenuBookIcon fontSize="small" />,
  coupons: <LocalOfferIcon fontSize="small" />,
  reports: <AssessmentIcon fontSize="small" />,
  taxReports: <AccountBalanceIcon fontSize="small" />,

  purchaseOrders: <AssignmentIcon fontSize="small" />,
  grn: <MoveToInboxIcon fontSize="small" />,
  srv: <ReceiptIcon fontSize="small" />,
  purchases: <ShoppingBasketIcon fontSize="small" />,
  purchaseReturns: <UndoIcon fontSize="small" />,
  suppliers: <StorefrontIcon fontSize="small" />,

  products: <CategoryIcon fontSize="small" />,
  inventory: <InventoryIcon fontSize="small" />,
  batches: <ScienceIcon fontSize="small" />,
  stockAudit: <FactCheckIcon fontSize="small" />,
  masters: <ListAltIcon fontSize="small" />,

  warehouses: <WarehouseIcon fontSize="small" />,
  warehouseOps: <ForkliftIcon fontSize="small" />,
  pickWaves: <AssignmentIcon fontSize="small" />,
  shipments: <LocalShippingIcon fontSize="small" />,
  gatepasses: <LocalShippingIcon fontSize="small" />,
  stockTransfers: <SwapHorizIcon fontSize="small" />,
  stockAdjustments: <TuneIcon fontSize="small" />,
  stockCounts: <FactCheckIcon fontSize="small" />,
  serials: <QrCode2Icon fontSize="small" />,
  inboundAppointments: <AssignmentIcon fontSize="small" />,
  qcInspections: <FactCheckIcon fontSize="small" />,
  repairs: <BuildIcon fontSize="small" />,

  ledgers: <MenuBookIcon fontSize="small" />,
  expenses: <PaymentsIcon fontSize="small" />,
  cashFlow: <AccountBalanceWalletIcon fontSize="small" />,
  cashRegisters: <PointOfSaleIcon fontSize="small" />,
  bankAccounts: <AccountBalanceIcon fontSize="small" />,
  chartOfAccounts: <AccountTreeIcon fontSize="small" />,
  journalEntries: <ArticleIcon fontSize="small" />,
  financials: <AssessmentIcon fontSize="small" />,

  users: <GroupIcon fontSize="small" />,
  branches: <StoreIcon fontSize="small" />,
  approvals: <TaskAltIcon fontSize="small" />,
  auditLogs: <HistoryIcon fontSize="small" />,
  backups: <StorageIcon fontSize="small" />,
  invoiceTemplates: <ArticleIcon fontSize="small" />,
  settings: <SettingsIcon fontSize="small" />,
  profile: <PersonIcon fontSize="small" />,
};

const FALLBACK_ICON = <ListAltIcon fontSize="small" />;

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
  const { user } = useAuth();

  // Already filtered by role and by the modules this company runs, so there is
  // nothing left to decide here.
  const groups = user?.navigation || [];

  return (
    <Box sx={{ width: DRAWER_WIDTH, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Brand Header */}
      <Box
        sx={{
          px: 2.5,
          // Matches the Navbar toolbar height so the brand block and the header
          // share a baseline and their bottom borders line up.
          height: { xs: 56, sm: 64 },
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
            {user?.businessMode === 'Advanced' ? 'Business Management' : 'Inventory & Billing'}
          </Typography>
        </Box>
      </Box>

      {/* Nav Groups */}
      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', px: 1.5, py: 1.5 }}>
        {groups.map((group, index) => (
          <Box key={group.group} sx={{ mb: 1.5 }}>
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
              {group.group}
            </Typography>
            <List disablePadding>
              {group.items.map((item) => (
                <NavItem
                  key={item.key}
                  label={item.label}
                  path={item.path}
                  icon={ICONS[item.key] || FALLBACK_ICON}
                  onClose={onClose}
                />
              ))}
            </List>
            {index < groups.length - 1 && (
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

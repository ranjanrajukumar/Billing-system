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
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OutboxIcon from '@mui/icons-material/Outbox';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import {
  alpha,
  Box,
  Collapse,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  useTheme,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

import AutorenewIcon from '@mui/icons-material/Autorenew';
import { SIDEBAR_WIDTHS, readBranding, readUiPrefs } from '../utils/uiPrefs.js';
import { mediaUrl } from '../utils/formatters.js';

/**
 * How wide the rail is, for this company, right now.
 *
 * A hook rather than a module constant: read once at import time it froze at
 * whatever storage held when the bundle loaded, so a saved width never showed
 * until the page was reloaded by hand. The auth payload wins over storage for
 * the same reason it does in App — storage makes the first paint correct, the
 * payload keeps it current.
 *
 * Compact buys 48px of page on every screen in the building, which on a wide
 * stock table is a column of figures you would otherwise scroll to reach.
 */
function useDrawerWidth() {
  const { user } = useAuth();
  const key = user?.ui?.sidebar || readUiPrefs().sidebar;
  return SIDEBAR_WIDTHS[key]?.px ?? SIDEBAR_WIDTHS.standard.px;
}

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
  stockIssues: <OutboxIcon fontSize="small" />,
  stockIssueReturns: <AssignmentReturnIcon fontSize="small" />,

  // The process parents. One icon for all three on purpose: it is the mark
  // that says "this is a flow, not a screen", and three different pictures
  // would make them read as three unrelated things.
  orderToCash: <AccountTreeOutlinedIcon fontSize="small" />,
  procureToStock: <AccountTreeOutlinedIcon fontSize="small" />,
  issueToReturn: <AccountTreeOutlinedIcon fontSize="small" />,
  planToReplenish: <AccountTreeOutlinedIcon fontSize="small" />,
  pickToShip: <AccountTreeOutlinedIcon fontSize="small" />,
  countToCorrect: <AccountTreeOutlinedIcon fontSize="small" />,
  recordToReport: <AccountTreeOutlinedIcon fontSize="small" />,
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

function NavItem({ label, path, icon, onClose, nested = false, trailing = null }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <ListItemButton
      component={NavLink}
      to={path}
      end={path === '/'}
      onClick={onClose}
      sx={{
        // Follows the company's corner setting, like everything else.
        borderRadius: `${Math.max((theme.shape.borderRadius || 14) - 4, 2)}px`,
        // Nested items sit in from the parent and lose a little height, so a
        // glance down the rail reads the hierarchy without needing the labels.
        px: 1.5,
        pl: nested ? 3.25 : 1.5,
        py: nested ? 0.65 : 0.9,
        mb: 0.25,
        color: 'text.secondary',
        '&.active': {
          bgcolor: isDark
            ? alpha(theme.palette.primary.main, 0.18)
            : alpha(theme.palette.primary.main, 0.08),
          color: 'primary.main',
          fontWeight: 600,
          '& .MuiListItemIcon-root': {
            color: 'primary.main',
          },
          '& .MuiListItemText-primary': {
            fontWeight: 600,
          },
          '&::before': {
            content: '""',
            position: 'absolute',
            left: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 3,
            height: '60%',
            borderRadius: '0 3px 3px 0',
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
      <ListItemIcon sx={{ color: 'inherit', minWidth: nested ? 28 : 34 }}>{icon}</ListItemIcon>
      <ListItemText
        primary={label}
        primaryTypographyProps={{
          fontSize: nested ? '0.82rem' : '0.875rem',
          fontWeight: nested ? 400 : 500,
        }}
      />
      {trailing}
    </ListItemButton>
  );
}

/**
 * A process and the documents inside it.
 *
 * The row does two jobs, and they are deliberately separate targets: the label
 * opens the process overview, the chevron expands the documents. Collapsing
 * them into one control would force a choice between "clicking a flow shows
 * you where the work is" and "clicking a flow lists its screens", and both are
 * things people want from the same row.
 *
 * It opens itself when the current page is inside it, so arriving at an invoice
 * from a link never leaves the sidebar disagreeing with the content.
 */
function NavProcess({ item, icon, onClose }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { pathname } = useLocation();

  const holdsCurrentPage = item.children.some((child) => pathname === child.path);
  const [open, setOpen] = useState(holdsCurrentPage);

  // Only ever forced open, never forced shut: a section the user collapsed by
  // hand should stay collapsed while they move around inside it.
  useEffect(() => {
    if (holdsCurrentPage) setOpen(true);
  }, [holdsCurrentPage]);

  return (
    <>
      <NavItem
        label={item.label}
        path={item.path}
        icon={icon}
        onClose={onClose}
        trailing={(
          <IconButton
            size="small"
            aria-label={open ? `Collapse ${item.label}` : `Expand ${item.label}`}
            onClick={(event) => {
              // The chevron sits inside the link, so without this the click
              // both toggles and navigates.
              event.preventDefault();
              event.stopPropagation();
              setOpen((was) => !was);
            }}
            sx={{ color: 'inherit', mr: 0.5, p: 0.25 }}
          >
            {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        )}
      />
      <Collapse in={open} timeout="auto" unmountOnExit>
        <Box
          sx={{
            ml: 2.4,
            pl: 0.6,
            borderLeft: `1px solid ${isDark ? alpha('#ffffff', 0.09) : alpha(theme.palette.primary.main, 0.14)}`,
          }}
        >
          <List disablePadding>
            {item.children.map((child) => (
              <NavItem
                key={child.key}
                nested
                label={child.label}
                path={child.path}
                icon={ICONS[child.key] || FALLBACK_ICON}
                onClose={onClose}
              />
            ))}
          </List>
        </Box>
      </Collapse>
    </>
  );
}

function SidebarContent({ onClose }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { user } = useAuth();

  // Already filtered by role and by the modules this company runs, so there is
  // nothing left to decide here.
  const groups = user?.navigation || [];

  // The company's own name and accent. Staff know the business they work for,
  // not the name of the software it runs on.
  const brandName = user?.companyName || readBranding().name;
  const brandLogo = user?.companyLogoUrl ? mediaUrl(user.companyLogoUrl) : null;
  const [logoBroken, setLogoBroken] = useState(false);
  const brand = theme.palette.primary.main;
  const brandDark = theme.palette.primary.dark;

  const DRAWER_WIDTH = useDrawerWidth();

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
          borderBottom: `1px solid ${isDark ? alpha('#ffffff', 0.06) : alpha(brand, 0.08)}`,
          flexShrink: 0,
        }}
      >
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: 2,
            background: `linear-gradient(135deg, ${brand} 0%, ${brandDark} 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            flexShrink: 0,
            boxShadow: `0 4px 14px ${alpha(brand, 0.4)}`,
          }}
        >
          {/* The company's own mark where there is one. It is already uploaded
              for the invoices; showing a stock storefront icon above it said
              this was somebody else's software. */}
          {brandLogo && !logoBroken
            ? <Box
                component="img"
                src={brandLogo}
                alt=""
                onError={() => setLogoBroken(true)}
                onLoad={(e) => {
                  // A placeholder pixel is not a logo. Anything this small
                  // cannot read as a mark at 38px, so show the icon instead.
                  if (e.currentTarget.naturalWidth < 8) setLogoBroken(true);
                }}
                sx={{ width: '100%', height: '100%', objectFit: 'contain', p: 0.5 }}
              />
            : <StorefrontIcon fontSize="small" />}
        </Box>
        <Box>
          <Typography
            title={brandName}
            sx={{
              fontWeight: 800,
              fontSize: '1rem',
              lineHeight: 1.2,
              color: 'text.primary',
              // Long trading names are the norm; two lines beats an ellipsis
              // that hides which company you are actually logged into.
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {brandName}
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
                px: 1.5,
                mt: 0.5,
                mb: 0.75,
                display: 'block',
                fontWeight: 600,
                fontSize: '0.65rem',
                textTransform: 'uppercase',
                // Wider tracking and a lighter weight let the group read as a
                // label for what follows rather than as another row competing
                // with the items under it.
                letterSpacing: '0.14em',
                color: 'text.disabled',
              }}
            >
              {group.group}
            </Typography>
            <List disablePadding>
              {group.items.map((item) => (item.children ? (
                <NavProcess
                  key={item.key}
                  item={item}
                  icon={ICONS[item.key] || FALLBACK_ICON}
                  onClose={onClose}
                />
              ) : (
                <NavItem
                  key={item.key}
                  label={item.label}
                  path={item.path}
                  icon={ICONS[item.key] || FALLBACK_ICON}
                  onClose={onClose}
                />
              )))}
            </List>
            {index < groups.length - 1 && (
              <Box sx={{ height: 4 }} />
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
          {brandName}
        </Typography>
      </Box>
    </Box>
  );
}

export default function Sidebar({ mobileOpen, onClose }) {
  const DRAWER_WIDTH = useDrawerWidth();
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

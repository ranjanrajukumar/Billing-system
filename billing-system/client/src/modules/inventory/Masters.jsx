import AddIcon from '@mui/icons-material/Add';
import BusinessIcon from '@mui/icons-material/Business';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import ListAltIcon from '@mui/icons-material/ListAlt';
import PeopleIcon from '@mui/icons-material/People';
import SaveIcon from '@mui/icons-material/Save';
import SettingsIcon from '@mui/icons-material/Settings';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import {
  alpha, Box, Button, Card, CardActionArea, CardContent,
  Chip, Grid, IconButton, MenuItem, Paper, Stack,
  TextField, Tooltip, Typography, useTheme,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import DataTable from '../../components/DataTable.jsx';
import Loader from '../../components/Loader.jsx';
import Modal from '../../components/Modal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Pagination from '../../components/Pagination.jsx';
import SearchBox from '../../components/SearchBox.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { categoriesApi, makeMasterDataResource, suppliersApi, usersApi } from '../../services/resource.service.js';

const text   = (name, label, required = true) => ({ name, label, required, type: 'text' });
const number = (name, label, required = true) => ({ name, label, required, type: 'number' });
const select = (name, label, options, required = true) => ({ name, label, required, type: 'select', options });

const serverMasters = {
  category: {
    title: 'Category Master', description: 'Product grouping for reports and billing.',
    api: categoriesApi, empty: { name: '', description: '' },
    fields: [text('name', 'Category Name'), text('description', 'Description', false)],
    columns: [
      { field: 'name', headerName: 'Category' },
      { field: 'description', headerName: 'Description', render: (r) => r.description || '—' },
    ],
  },
  supplier: {
    title: 'Supplier Master', description: 'Vendor contact, GST, and address details.',
    api: suppliersApi,
    empty: { supplierName: '', contactPerson: '', mobileNumber: '', email: '', gstNumber: '', address: '', city: '', state: '', pincode: '', isActive: 'true' },
    fields: [
      text('supplierName', 'Supplier Name'), text('contactPerson', 'Contact Person', false),
      text('mobileNumber', 'Mobile Number'), text('email', 'Email', false),
      text('gstNumber', 'GST Number', false), text('address', 'Address', false),
      text('city', 'City', false), text('state', 'State', false), text('pincode', 'Pincode', false),
      select('isActive', 'Status', [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]),
    ],
    columns: [
      { field: 'supplierName', headerName: 'Supplier' },
      { field: 'contactPerson', headerName: 'Contact', render: (r) => r.contactPerson || '—' },
      { field: 'mobileNumber', headerName: 'Mobile' },
      { field: 'gstNumber', headerName: 'GST', render: (r) => r.gstNumber || '—' },
    ],
  },
  user: {
    title: 'User Master', description: 'Admin-managed users and role assignments.',
    api: usersApi, needsRoles: true,
    empty: { name: '', email: '', mobile: '', roleId: '', password: '', isActive: 'true' },
    fields: [
      text('name', 'User Name'), text('email', 'Email'), text('mobile', 'Mobile', false),
      select('roleId', 'Role', []), text('password', 'Password', false),
      select('isActive', 'Status', [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]),
    ],
    columns: [
      { field: 'name', headerName: 'User' }, { field: 'email', headerName: 'Email' },
      { field: 'role', headerName: 'Role' },
      { field: 'isActive', headerName: 'Status', render: (r) => <Chip label={r.isActive ? 'Active' : 'Inactive'} size="small" color={r.isActive ? 'success' : 'default'} sx={{ fontWeight: 700, fontSize: '0.7rem' }} /> },
    ],
  },
};

const masterDataForms = {
  brand:           { title: 'Brand Master',           description: 'Product brand names for catalog filtering.',                  api: makeMasterDataResource('brand'),           empty: { name: '', description: '' },                    fields: [text('name', 'Brand Name'), text('description', 'Description', false)] },
  unit:            { title: 'Unit Master',             description: 'Units (e.g. PCS, KG, BOX, BAG) and conversion rules.',         api: makeMasterDataResource('unit'),            empty: { code: '', name: '', baseUnitCode: '', conversionFactor: 1, precision: 0 }, fields: [text('code', 'Unit Code (e.g. BOX)'), text('name', 'Unit Name (e.g. Box)'), text('baseUnitCode', 'Base Unit (e.g. PCS)', false), number('conversionFactor', 'Conversion Factor (e.g. 10)', false), number('precision', 'Decimal Precision', false)] },
  warehouse:       { title: 'Warehouse Master',        description: 'Stock locations for inventory movement.',                    api: makeMasterDataResource('warehouse'),       empty: { name: '', code: '', city: '', isDefault: 'false' }, fields: [text('name', 'Warehouse Name'), text('code', 'Code'), text('city', 'City', false), select('isDefault', 'Default', [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }], false)] },
  gstTax:          { title: 'GST Tax Master',          description: 'GST tax slabs for product and invoice calculation.',          api: makeMasterDataResource('gstTax'),          empty: { name: '', rate: 18, taxType: 'GST' },           fields: [text('name', 'Tax Name'), number('rate', 'Rate %'), select('taxType', 'Tax Type', ['GST','CGST/SGST','IGST'].map((v) => ({ value: v, label: v })))] },
  hsnSac:          { title: 'HSN/SAC Master',          description: 'Goods and service tax classification codes.',                api: makeMasterDataResource('hsnSac'),          empty: { code: '', type: 'HSN', description: '', gstRate: 18 }, fields: [text('code', 'Code'), select('type', 'Type', ['HSN','SAC'].map((v) => ({ value: v, label: v }))), text('description', 'Description'), number('gstRate', 'GST Rate %')] },
  paymentMode:     { title: 'Payment Mode Master',     description: 'Allowed receipt and payment methods.',                       api: makeMasterDataResource('paymentMode'),     empty: { name: '', accountType: '', isActive: 'true' },  fields: [text('name', 'Payment Mode'), text('accountType', 'Account Type', false), select('isActive', 'Status', [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }])] },
  expenseCategory: { title: 'Expense Category Master', description: 'Operating expense heads for reports.',                      api: makeMasterDataResource('expenseCategory'), empty: { name: '', description: '' },                    fields: [text('name', 'Expense Category'), text('description', 'Description', false)] },
  department:      { title: 'Department Master',      description: 'Departments and cost centres material is issued to.',        api: makeMasterDataResource('department'),      empty: { name: '', code: '', description: '' },          fields: [text('name', 'Department'), text('code', 'Code', false), text('description', 'Description', false)] },
  financialYear:   { title: 'Financial Year Master',   description: 'Accounting year boundaries and active year.',               api: makeMasterDataResource('financialYear'),   empty: { name: '', startDate: '', endDate: '', status: 'Open' }, fields: [text('name', 'Financial Year'), text('startDate', 'Start Date'), text('endDate', 'End Date'), select('status', 'Status', ['Open','Closed'].map((v) => ({ value: v, label: v })))] },
  invoiceSettings: { title: 'Invoice Settings',        description: 'Invoice prefix, numbering, terms, and default notes.',     api: makeMasterDataResource('invoiceSettings'), empty: { invoicePrefix: 'INV', nextNumber: 1, terms: '', footerNote: '' }, fields: [text('invoicePrefix', 'Invoice Prefix'), number('nextNumber', 'Next Number'), text('terms', 'Terms', false), text('footerNote', 'Footer Note', false)] },
};

const tileGroups = [
  {
    group: 'Quick Links',
    tiles: [
      { key: 'company',  title: 'Company Profile', description: 'Business profile and GST details.',         icon: <BusinessIcon />,  path: '/settings',  color: 'primary' },
      { key: 'userlink', title: 'User & Roles',     description: 'Manage system users and access roles.',     icon: <PeopleIcon />,    path: '/users',     color: 'info' },
      { key: 'customer', title: 'Customer Master',  description: 'Customer billing and contact details.',     icon: <PeopleIcon />,    path: '/customers', color: 'success' },
      { key: 'product',  title: 'Product Master',   description: 'Product catalog, price, stock, HSN, GST.', icon: <Inventory2Icon />, path: '/products',  color: 'warning' },
    ],
  },
  {
    group: 'Data Masters',
    tiles: [
      { key: 'category', group: 'server',     icon: <Inventory2Icon />, color: 'primary' },
      { key: 'supplier', group: 'server',     icon: <PeopleIcon />,     color: 'info' },
      ...Object.entries(masterDataForms).map(([key]) => ({ key, group: 'masterData', icon: <SettingsIcon />, color: 'secondary' })),
    ],
  },
];

function MasterTileCard({ item, config, selected, onSelect, onNavigate }) {
  const theme = useTheme();
  const colorMap = {
    primary: theme.palette.primary.main,
    info: theme.palette.info.main,
    success: theme.palette.success.main,
    warning: theme.palette.warning.main,
    secondary: theme.palette.secondary.main,
  };
  const color = colorMap[item.color || 'primary'];
  const isSelected = selected === item.key;

  return (
    <Card
      variant="outlined"
      className="card-hover"
      sx={{
        height: '100%',
        borderColor: isSelected ? 'primary.main' : 'divider',
        borderWidth: isSelected ? 2 : 1,
        transition: 'border-color 0.2s, box-shadow 0.2s',
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 3,
          background: color,
          opacity: isSelected ? 1 : 0,
          transition: 'opacity 0.2s',
        },
      }}
    >
      <CardActionArea
        sx={{ height: '100%', p: 0.5 }}
        onClick={() => item.path ? onNavigate(item.path) : onSelect(item.key)}
      >
        <CardContent>
          <Stack spacing={1.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Box
                sx={{
                  width: 40, height: 40, borderRadius: 2,
                  bgcolor: alpha(color, 0.1),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: color,
                }}
              >
                {item.icon}
              </Box>
              {item.path ? (
                <ArrowForwardIcon sx={{ fontSize: 16, color: 'text.disabled', mt: 0.5 }} />
              ) : (
                <Chip size="small" label="Open" variant="outlined" sx={{ fontSize: '0.68rem', height: 20 }} />
              )}
            </Stack>
            <Box>
              <Typography variant="subtitle2" fontWeight={700} lineHeight={1.3}>{config?.title || item.title}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: 'block', lineHeight: 1.4 }}>
                {config?.description || item.description}
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

function MasterTable({ masterKey, config }) {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [query, setQuery] = useState({ page: 1, limit: 10, search: '' });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [roles, setRoles] = useState([]);
  const { showToast } = useToast();
  const theme = useTheme();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: config.empty });

  const fields = useMemo(() => {
    if (!config.needsRoles) return config.fields;
    return config.fields.map((f) =>
      f.name === 'roleId' ? { ...f, options: roles.map((r) => ({ value: r.id, label: r.name })) } : f
    );
  }, [config.fields, config.needsRoles, roles]);

  const load = async () => {
    setLoading(true);
    try {
      const result = await config.api.list(query);
      setRows(result?.data || []); setMeta(result?.meta || {});
    } catch {
      setRows([]); setMeta({});
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [masterKey, query]);
  useEffect(() => { if (config.needsRoles) usersApi.roles.list().then((r) => setRoles(Array.isArray(r) ? r : (r?.data || []))).catch(() => setRoles([])); }, [config.needsRoles]);

  const openForm = (row = null) => {
    setEditing(row || {});
    const values = row ? { ...row } : config.empty;
    fields.forEach((f) => { if (f.type === 'select' && values[f.name] !== undefined) values[f.name] = String(values[f.name]); });
    reset(values);
  };

  const submit = async (values) => {
    try {
      const payload = { ...values };
      if (payload.isActive !== undefined) payload.isActive = payload.isActive === true || payload.isActive === 'true';
      if (payload.isDefault !== undefined) payload.isDefault = payload.isDefault === true || payload.isDefault === 'true';
      editing.id ? await config.api.update(editing.id, payload) : await config.api.create(payload);
      showToast(`${config.title} saved`);
      setEditing(null); load();
    } catch (err) {
      const msg = err.response?.data?.message || 'Error saving';
      const details = err.response?.data?.errors?.map((e) => e.msg).join(', ');
      showToast(details ? `${msg}: ${details}` : msg, 'error');
    }
  };

  const remove = async () => {
    await config.api.remove(deleting.id);
    showToast(`${config.title} deleted`);
    setDeleting(null); load();
  };

  const columns = [
    ...(config.columns || fields.slice(0, 4).map((f) => ({
      field: f.name,
      headerName: f.label,
      render: (row) => String(row[f.name] ?? '—'),
    }))),
    {
      field: 'actions', headerName: 'Actions',
      render: (row) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => openForm(row)} sx={{ borderRadius: 1.5, color: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.08), '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.15) } }}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" color="error" onClick={() => setDeleting(row)} sx={{ borderRadius: 1.5, bgcolor: alpha(theme.palette.error.main, 0.08), '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.15) } }}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Box>
          <Typography variant="h6" fontWeight={700}>{config.title}</Typography>
          <Typography variant="caption" color="text.secondary">{config.description}</Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <SearchBox value={query.search} onChange={(s) => setQuery({ ...query, search: s, page: 1 })} />
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => openForm()} sx={{ borderRadius: 2, whiteSpace: 'nowrap' }}>
            Add {config.title.split(' ')[0]}
          </Button>
        </Stack>
      </Stack>

      {loading ? <Loader /> : <DataTable columns={columns} rows={rows} meta={meta} />}
      <Pagination meta={meta} onChangePage={(p) => setQuery({ ...query, page: p })} onChangeLimit={(l) => setQuery({ ...query, limit: l })} />

      <Modal open={Boolean(editing)} title={editing?.id ? `Update ${config.title}` : `Add ${config.title}`} onClose={() => setEditing(null)}>
        <Grid container spacing={2} component="form" onSubmit={handleSubmit(submit)}>
          {fields.map((f) => (
            <Grid item xs={12} sm={6} key={f.name}>
              <TextField
                fullWidth select={f.type === 'select'} type={f.type === 'number' ? 'number' : 'text'}
                label={f.label} {...register(f.name, { required: f.required && 'Required' })}
                error={Boolean(errors[f.name])} helperText={errors[f.name]?.message}
                InputLabelProps={{ shrink: true }}
              >
                {f.type === 'select' && f.options.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </TextField>
            </Grid>
          ))}
          <Grid item xs={12}>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button type="button" onClick={() => setEditing(null)} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button startIcon={<SaveIcon />} type="submit" variant="contained" disabled={isSubmitting} sx={{ borderRadius: 2 }}>
                {isSubmitting ? 'Saving…' : 'Save'}
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${config.title}`}
        message={`Delete this ${config.title.toLowerCase()} record? This cannot be undone.`}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </Stack>
  );
}

export default function Masters() {
  const [selected, setSelected] = useState(null);
  const navigate = useNavigate();
  const config = selected ? (serverMasters[selected] || masterDataForms[selected]) : null;

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Master Forms"
        subtitle="Configure company, users, customers, products, taxation, payments, and invoice settings"
        icon={<ListAltIcon />}
      />

      {tileGroups.map((group) => (
        <Box key={group.group}>
          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'text.disabled', mb: 1.5, display: 'block' }}>
            {group.group}
          </Typography>
          <Grid container spacing={2}>
            {group.tiles.map((item) => {
              const cfg = item.group === 'server'
                ? serverMasters[item.key]
                : item.group === 'masterData'
                ? masterDataForms[item.key]
                : null;
              return (
                <Grid item xs={6} sm={4} md={3} lg={2} key={item.key}>
                  <MasterTileCard
                    item={item}
                    config={cfg}
                    selected={selected}
                    onSelect={setSelected}
                    onNavigate={navigate}
                  />
                </Grid>
              );
            })}
          </Grid>
        </Box>
      ))}

      {/* Master data modal */}
      <Modal
        open={Boolean(selected && config)}
        title={config?.title || 'Master'}
        onClose={() => setSelected(null)}
        maxWidth="lg"
      >
        {config && <MasterTable masterKey={selected} config={config} />}
      </Modal>
    </Stack>
  );
}

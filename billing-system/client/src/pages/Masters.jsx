import AddIcon from '@mui/icons-material/Add';
import BusinessIcon from '@mui/icons-material/Business';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import PeopleIcon from '@mui/icons-material/People';
import SaveIcon from '@mui/icons-material/Save';
import SettingsIcon from '@mui/icons-material/Settings';
import { Box, Button, Card, CardActionArea, CardActions, CardContent, Chip, Divider, Grid, IconButton, MenuItem, Paper, Stack, TextField, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import Pagination from '../components/Pagination.jsx';
import SearchBox from '../components/SearchBox.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { categoriesApi, makeMasterDataResource, suppliersApi, usersApi } from '../services/resource.service.js';

const icons = {
  company: <BusinessIcon />,
  people: <PeopleIcon />,
  inventory: <Inventory2Icon />,
  settings: <SettingsIcon />
};

const text = (name, label, required = true) => ({ name, label, required, type: 'text' });
const number = (name, label, required = true) => ({ name, label, required, type: 'number' });
const select = (name, label, options, required = true) => ({ name, label, required, type: 'select', options });

const serverMasters = {
  category: {
    title: 'Category Master',
    description: 'Product grouping for reports and billing.',
    api: categoriesApi,
    empty: { name: '', description: '' },
    fields: [text('name', 'Category Name'), text('description', 'Description', false)],
    columns: [
      { field: 'name', headerName: 'Category' },
      { field: 'description', headerName: 'Description', render: (row) => row.description || 'Not provided' }
    ]
  },
  supplier: {
    title: 'Supplier Master',
    description: 'Vendor contact, GST, and address details.',
    api: suppliersApi,
    empty: { supplierName: '', contactPerson: '', mobileNumber: '', email: '', gstNumber: '', address: '', city: '', state: '', pincode: '', isActive: 'true' },
    fields: [
      text('supplierName', 'Supplier Name'),
      text('contactPerson', 'Contact Person', false),
      text('mobileNumber', 'Mobile Number'),
      text('email', 'Email', false),
      text('gstNumber', 'GST Number', false),
      text('address', 'Address', false),
      text('city', 'City', false),
      text('state', 'State', false),
      text('pincode', 'Pincode', false),
      select('isActive', 'Status', [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }])
    ],
    columns: [
      { field: 'supplierName', headerName: 'Supplier' },
      { field: 'contactPerson', headerName: 'Contact', render: (row) => row.contactPerson || 'Not provided' },
      { field: 'mobileNumber', headerName: 'Mobile' },
      { field: 'gstNumber', headerName: 'GST', render: (row) => row.gstNumber || 'Not provided' }
    ]
  },
  user: {
    title: 'User Master',
    description: 'Admin-managed users and role assignments.',
    api: usersApi,
    needsRoles: true,
    empty: { name: '', email: '', mobile: '', roleId: '', password: '', isActive: 'true' },
    fields: [
      text('name', 'User Name'),
      text('email', 'Email'),
      text('mobile', 'Mobile', false),
      select('roleId', 'Role', []),
      text('password', 'Password', false),
      select('isActive', 'Status', [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }])
    ],
    columns: [
      { field: 'name', headerName: 'User' },
      { field: 'email', headerName: 'Email' },
      { field: 'role', headerName: 'Role' },
      { field: 'isActive', headerName: 'Status', render: (row) => row.isActive ? 'Active' : 'Inactive' }
    ]
  }
};

const masterDataForms = {
  brand: {
    title: 'Brand Master',
    description: 'Product brand names for catalog filtering.',
    api: makeMasterDataResource('brand'),
    empty: { name: '', description: '' },
    fields: [text('name', 'Brand Name'), text('description', 'Description', false)]
  },
  unit: {
    title: 'Unit Master',
    description: 'Units such as pcs, kg, box, meter, and service.',
    api: makeMasterDataResource('unit'),
    empty: { code: '', name: '', precision: 0 },
    fields: [text('code', 'Unit Code'), text('name', 'Unit Name'), number('precision', 'Decimal Precision', false)]
  },
  warehouse: {
    title: 'Warehouse Master',
    description: 'Stock locations for inventory movement.',
    api: makeMasterDataResource('warehouse'),
    empty: { name: '', code: '', city: '', isDefault: 'false' },
    fields: [text('name', 'Warehouse Name'), text('code', 'Code'), text('city', 'City', false), select('isDefault', 'Default', [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }], false)]
  },
  gstTax: {
    title: 'GST Tax Master',
    description: 'GST tax slabs for product and invoice calculation.',
    api: makeMasterDataResource('gstTax'),
    empty: { name: '', rate: 18, taxType: 'GST' },
    fields: [text('name', 'Tax Name'), number('rate', 'Rate %'), select('taxType', 'Tax Type', ['GST', 'CGST/SGST', 'IGST'].map((value) => ({ value, label: value })))]
  },
  hsnSac: {
    title: 'HSN/SAC Master',
    description: 'Goods and service tax classification codes.',
    api: makeMasterDataResource('hsnSac'),
    empty: { code: '', type: 'HSN', description: '', gstRate: 18 },
    fields: [text('code', 'Code'), select('type', 'Type', ['HSN', 'SAC'].map((value) => ({ value, label: value }))), text('description', 'Description'), number('gstRate', 'GST Rate %')]
  },
  paymentMode: {
    title: 'Payment Mode Master',
    description: 'Allowed receipt and payment methods.',
    api: makeMasterDataResource('paymentMode'),
    empty: { name: '', accountType: '', isActive: 'true' },
    fields: [text('name', 'Payment Mode'), text('accountType', 'Account Type', false), select('isActive', 'Status', [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }])]
  },
  expenseCategory: {
    title: 'Expense Category Master',
    description: 'Operating expense heads for reports.',
    api: makeMasterDataResource('expenseCategory'),
    empty: { name: '', description: '' },
    fields: [text('name', 'Expense Category'), text('description', 'Description', false)]
  },
  financialYear: {
    title: 'Financial Year Master',
    description: 'Accounting year boundaries and active year.',
    api: makeMasterDataResource('financialYear'),
    empty: { name: '', startDate: '', endDate: '', status: 'Open' },
    fields: [text('name', 'Financial Year'), text('startDate', 'Start Date'), text('endDate', 'End Date'), select('status', 'Status', ['Open', 'Closed'].map((value) => ({ value, label: value })))]
  },
  invoiceSettings: {
    title: 'Invoice Settings and Master Table',
    description: 'Invoice prefix, numbering, terms, and default notes.',
    api: makeMasterDataResource('invoiceSettings'),
    empty: { invoicePrefix: 'INV', nextNumber: 1, terms: '', footerNote: '' },
    fields: [text('invoicePrefix', 'Invoice Prefix'), number('nextNumber', 'Next Number'), text('terms', 'Terms', false), text('footerNote', 'Footer Note', false)]
  }
};

const masterTiles = [
  { key: 'company', title: 'Company Master', description: 'Business profile and GST details.', icon: icons.company, path: '/settings', status: 'Settings' },
  { key: 'user', title: 'User & Roles', description: 'Manage users and roles.', icon: icons.people, path: '/users', status: 'Server' },
  { key: 'customer', title: 'Customer Master', description: 'Customer billing and contact details.', icon: icons.people, path: '/customers', status: 'Server' },
  { key: 'supplier', group: 'server', icon: icons.people, status: 'Server' },
  { key: 'category', group: 'server', icon: icons.inventory, status: 'Server' },
  { key: 'product', title: 'Product Master', description: 'Product catalog, price, stock, HSN, GST.', icon: icons.inventory, path: '/products', status: 'Server' },
  ...Object.entries(masterDataForms).map(([key, config]) => ({ key, group: 'masterData', icon: icons.settings, status: 'Server', ...config }))
];

export default function Masters() {
  const [selected, setSelected] = useState(null);
  const tile = masterTiles.find((item) => item.key === selected);
  const config = selected === 'role' ? null : serverMasters[selected] || masterDataForms[selected];
  const navigate = useNavigate();

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h4">Master Forms</Typography>
        <Typography variant="body2" color="text.secondary">Recommended master setup for company, users, customers, products, taxation, payments, stock locations, and invoice configuration.</Typography>
      </Box>
      <Grid container spacing={1.5}>
        {masterTiles.map((item) => {
          const full = item.group === 'server' ? serverMasters[item.key] : item;
          return (
            <Grid item xs={12} sm={6} md={4} lg={3} key={item.key}>
              <Card variant="outlined" sx={{ height: '100%', borderColor: selected === item.key ? 'primary.main' : 'divider' }}>
                <CardActionArea
                  sx={{ height: '100%' }}
                  onClick={() => item.path ? navigate(item.path) : setSelected(item.key)}
                >
                  <CardContent>
                    <Stack spacing={1}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                        <Box color="primary.main">{item.icon}</Box>
                        <Chip size="small" label={item.status} />
                      </Stack>
                      <Typography variant="subtitle1" fontWeight={700}>{full.title}</Typography>
                      <Typography variant="body2" color="text.secondary">{full.description}</Typography>
                    </Stack>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          );
        })}
      </Grid>
      <Modal open={Boolean(selected && !tile?.path)} title={config?.title || tile?.title || 'Master'} onClose={() => setSelected(null)} maxWidth="lg">
        {config ? <MasterTable masterKey={selected} config={config} /> : null}
      </Modal>
    </Stack>
  );
}



function MasterTable({ masterKey, config }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [query, setQuery] = useState({ page: 1, limit: 10, search: '' });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [roles, setRoles] = useState([]);
  const { showToast } = useToast();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: config.empty });

  const fields = useMemo(() => {
    if (!config.needsRoles) return config.fields;
    return config.fields.map((field) => field.name === 'roleId'
      ? { ...field, options: roles.map((role) => ({ value: role.id, label: role.name })) }
      : field);
  }, [config.fields, config.needsRoles, roles]);

  const load = async () => {
    setLoading(true);
    const result = await config.api.list(query);
    setRows(result.data);
    setMeta(result.meta);
    setLoading(false);
  };

  useEffect(() => { load(); }, [masterKey, query]);
  useEffect(() => {
    if (config.needsRoles) usersApi.roles.list().then(setRoles);
  }, [config.needsRoles]);

  const openForm = (row = null) => {
    setEditing(row || {});
    const values = row ? { ...row } : config.empty;
    fields.forEach((field) => {
      if (field.type === 'select' && values[field.name] !== undefined) values[field.name] = String(values[field.name]);
    });
    reset(values);
  };

  const submit = async (values) => {
    try {
      const payload = { ...values };
      if (payload.isActive !== undefined) payload.isActive = payload.isActive === true || payload.isActive === 'true';
      if (payload.isDefault !== undefined) payload.isDefault = payload.isDefault === true || payload.isDefault === 'true';
      editing.id ? await config.api.update(editing.id, payload) : await config.api.create(payload);
      showToast(`${config.title} saved`);
      setEditing(null);
      load();
    } catch (error) {
      const msg = error.response?.data?.message || error.message || 'Error saving record';
      const details = error.response?.data?.errors?.map(e => e.msg).join(', ');
      showToast(details ? `${msg}: ${details}` : msg, 'error');
    }
  };

  const remove = async () => {
    await config.api.remove(deleting.id);
    showToast(`${config.title} deleted`);
    setDeleting(null);
    load();
  };

  const columns = [
    ...(config.columns || fields.slice(0, 4).map((field) => ({
      field: field.name,
      headerName: field.label,
      render: (row) => String(row[field.name] ?? 'Not provided')
    }))),
    {
      field: 'actions',
      headerName: 'Actions',
      render: (row) => (
        <>
          <Tooltip title="Edit"><IconButton onClick={() => openForm(row)}><EditIcon /></IconButton></Tooltip>
          <Tooltip title="Delete"><IconButton color="error" onClick={() => setDeleting(row)}><DeleteIcon /></IconButton></Tooltip>
        </>
      )
    }
  ];

  const displayColumns = columns.filter((column) => column.field !== 'actions');
  const mobileCards = (
    <Stack spacing={1.5}>
      {rows.map((row) => (
        <Card key={row.id} variant="outlined" sx={{ borderRadius: 2 }}>
          <CardContent sx={{ pb: 1 }}>
            <Stack spacing={1}>
              <Typography variant="subtitle1" fontWeight={700}>{displayColumns[0]?.render ? displayColumns[0].render(row) : row[displayColumns[0]?.field]}</Typography>
              <Divider />
              {displayColumns.slice(1).map((column) => (
                <Box key={column.field}>
                  <Typography variant="caption" color="text.secondary">{column.headerName}</Typography>
                  <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{column.render ? column.render(row) : row[column.field]}</Typography>
                </Box>
              ))}
            </Stack>
          </CardContent>
          <CardActions sx={{ justifyContent: 'flex-end', pt: 0 }}>
            <Tooltip title="Edit"><IconButton onClick={() => openForm(row)}><EditIcon /></IconButton></Tooltip>
            <Tooltip title="Delete"><IconButton color="error" onClick={() => setDeleting(row)}><DeleteIcon /></IconButton></Tooltip>
          </CardActions>
        </Card>
      ))}
      {!rows.length && (
        <Card variant="outlined" sx={{ borderRadius: 2 }}>
          <CardContent><Typography color="text.secondary">No records found</Typography></CardContent>
        </Card>
      )}
    </Stack>
  );

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="h6">{config.title}</Typography>
            <Typography variant="body2" color="text.secondary">{config.description}</Typography>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <SearchBox value={query.search} onChange={(search) => setQuery({ ...query, search, page: 1 })} />
            <Button startIcon={<AddIcon />} variant="contained" onClick={() => openForm()}>Add</Button>
          </Stack>
        </Stack>
        {loading ? <Loader /> : isMobile ? mobileCards : <DataTable columns={columns} rows={rows} />}
        <Pagination meta={meta} onChangePage={(page) => setQuery({ ...query, page })} onChangeLimit={(limit) => setQuery({ ...query, limit })} />
      </Stack>
      <Modal open={Boolean(editing)} title={editing?.id ? `Update ${config.title}` : `Add ${config.title}`} onClose={() => setEditing(null)}>
        <Grid container spacing={2} component="form" onSubmit={handleSubmit(submit)} sx={{ pt: 1 }}>
          {fields.map((field) => (
            <Grid item xs={12} sm={6} key={field.name}>
              <TextField
                fullWidth
                select={field.type === 'select'}
                type={field.type === 'number' ? 'number' : 'text'}
                label={field.label}
                {...register(field.name, { required: field.required && 'Required' })}
                error={Boolean(errors[field.name])}
                helperText={errors[field.name]?.message}
              >
                {field.type === 'select' && field.options.map((option) => (
                  <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                ))}
              </TextField>
            </Grid>
          ))}
          <Grid item xs={12}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end">
              <Button onClick={() => setEditing(null)}>Cancel</Button>
              <Button startIcon={<SaveIcon />} type="submit" variant="contained" disabled={isSubmitting}>Save</Button>
            </Stack>
          </Grid>
        </Grid>
      </Modal>
      <ConfirmDialog open={Boolean(deleting)} message={`Delete this ${config.title.toLowerCase()} record?`} onCancel={() => setDeleting(null)} onConfirm={remove} />
    </Paper>
  );
}

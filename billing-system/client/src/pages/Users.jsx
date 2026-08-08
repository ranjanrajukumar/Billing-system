import AddIcon from '@mui/icons-material/Add';
import GroupIcon from '@mui/icons-material/Group';
import ShieldIcon from '@mui/icons-material/Shield';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import {
  alpha, Avatar, Box, Button, Checkbox, Chip, FormControlLabel,
  MenuItem, Paper, Stack, Switch, Tab, Tabs, TextField,
  Tooltip, Typography, useTheme,
} from '@mui/material';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import DataTable from '../components/DataTable.jsx';
import Loader from '../components/Loader.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Pagination from '../components/Pagination.jsx';
import SearchBox from '../components/SearchBox.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useFetch } from '../hooks/useFetch.js';
import { usersApi } from '../services/resource.service.js';

const MODULES = [
  { id: 'users', label: 'User Management' },
  { id: 'roles', label: 'Role & Permissions' },
  { id: 'masters', label: 'Master Data' },
  { id: 'inventory', label: 'Inventory Management' },
  { id: 'purchases', label: 'Purchase Management' },
  { id: 'sales', label: 'Sales & Billing' },
  { id: 'accounts', label: 'Accounts & Ledgers' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'System Settings' },
];
const ACTIONS = ['view', 'create', 'edit', 'delete'];

/* ──────────────────── ROLE MANAGER ──────────────────── */
function RoleManager() {
  const { data, loading, mutate } = useFetch(() => usersApi.roles.list(), []);
  const roles = Array.isArray(data) ? data : (data?.data || []);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const { showToast } = useToast();
  const theme = useTheme();
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, control } = useForm();

  const handleOpen = (role = null) => {
    setEditing(role);
    const defaultPerm = {};
    MODULES.forEach((m) => { defaultPerm[m.id] = { view: false, create: false, edit: false, delete: false }; });
    reset(role ? { name: role.name, permissions: { ...defaultPerm, ...role.permissions } } : { name: '', permissions: defaultPerm });
    setOpen(true);
  };
  const handleClose = () => { setOpen(false); setEditing(null); reset(); };

  const onSubmit = async (values) => {
    try {
      editing ? await usersApi.roles.update(editing.id, values) : await usersApi.roles.create(values);
      showToast(`Role ${editing ? 'updated' : 'created'} successfully`);
      mutate(); handleClose();
    } catch (err) { showToast(err.response?.data?.message || 'Error saving role', 'error'); }
  };

  const handleDelete = async () => {
    try { await usersApi.roles.remove(deleting.id); showToast('Role deleted'); mutate(); }
    catch (err) { showToast(err.response?.data?.message || 'Error deleting role', 'error'); }
    finally { setDeleting(null); }
  };

  if (loading) return <Loader />;

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle1" fontWeight={700} color="text.secondary">
          {roles.length} roles configured
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()} sx={{ borderRadius: 2 }}>
          Add Role
        </Button>
      </Stack>

      <DataTable
        columns={[
          { field: 'name', headerName: 'Role Name', render: (r) => (
            <Stack direction="row" spacing={1} alignItems="center">
              <Box sx={{ width: 28, height: 28, borderRadius: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'primary.main' }}>
                <ShieldIcon sx={{ fontSize: 14 }} />
              </Box>
              <Typography fontWeight={700} variant="body2">{r.name}</Typography>
            </Stack>
          )},
          { field: 'permissions', headerName: 'Access', render: (r) => {
            if (r.name === 'Admin') return <Chip size="small" label="Full Access" color="primary" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />;
            const count = Object.values(r.permissions || {}).filter((v) => v.view).length;
            return <Chip size="small" label={`${count} Modules`} variant="outlined" sx={{ fontWeight: 700, fontSize: '0.7rem' }} />;
          }},
          { field: 'actions', headerName: 'Actions', render: (r) => (
            <Stack direction="row" spacing={0.5}>
              <Tooltip title="Edit">
                <Button size="small" onClick={() => handleOpen(r)} sx={{ borderRadius: 1.5, minWidth: 0, px: 1.5 }} variant="outlined">Edit</Button>
              </Tooltip>
              <Tooltip title="Delete">
                <Button size="small" color="error" onClick={() => setDeleting(r)} disabled={r.name === 'Admin'} sx={{ borderRadius: 1.5, minWidth: 0, px: 1.5 }} variant="outlined">Delete</Button>
              </Tooltip>
            </Stack>
          )},
        ]}
        rows={roles}
      />

      <Modal open={open} onClose={handleClose} title={editing ? 'Edit Role' : 'Add Role'} maxWidth="md">
        <form onSubmit={handleSubmit(onSubmit)}>
          <Stack spacing={2.5} sx={{ pt: 0.5 }}>
            <TextField label="Role Name" fullWidth disabled={editing?.name === 'Admin'}
              {...register('name', { required: 'Role name is required' })} error={Boolean(errors.name)} helperText={errors.name?.message} />
            <Box sx={{ overflowX: 'auto', borderRadius: 2, border: `1px solid ${alpha(theme.palette.divider, 1)}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: alpha(theme.palette.primary.main, 0.05) }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: theme.palette.text.secondary }}>Module</th>
                    {ACTIONS.map((a) => (
                      <th key={a} style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, fontSize: '0.75rem', textTransform: 'capitalize', color: theme.palette.text.secondary }}>{a}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MODULES.map((m, mi) => (
                    <tr key={m.id} style={{ borderTop: `1px solid ${alpha(theme.palette.divider, 1)}`, background: mi % 2 === 0 ? 'transparent' : alpha(theme.palette.action.hover, 0.3) }}>
                      <td style={{ padding: '6px 14px', fontWeight: 600, fontSize: '0.875rem' }}>{m.label}</td>
                      {ACTIONS.map((action) => (
                        <td key={action} style={{ padding: '2px 8px', textAlign: 'center' }}>
                          <Controller
                            name={`permissions.${m.id}.${action}`}
                            control={control}
                            render={({ field }) => (
                              <Checkbox {...field} checked={field.value || false} disabled={editing?.name === 'Admin'} size="small" color="primary" />
                            )}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={handleClose} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button type="submit" variant="contained" disabled={isSubmitting} sx={{ borderRadius: 2 }}>
                {isSubmitting ? 'Saving…' : 'Save Role'}
              </Button>
            </Stack>
          </Stack>
        </form>
      </Modal>

      <ConfirmDialog open={Boolean(deleting)} title="Delete Role" message={`Delete the "${deleting?.name}" role?`} onCancel={() => setDeleting(null)} onConfirm={handleDelete} />
    </Stack>
  );
}

/* ──────────────────── USER MANAGER ──────────────────── */
function UserManager() {
  const [params, setParams] = useState({ page: 1, limit: 10, search: '' });
  const { data, loading, mutate } = useFetch(() => usersApi.list(params), [params]);
  const { data: rolesRes } = useFetch(() => usersApi.roles.list(), []);
  const roles = Array.isArray(rolesRes) ? rolesRes : (rolesRes?.data || []);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const { showToast } = useToast();
  const theme = useTheme();
  const { register, handleSubmit, formState: { errors }, reset } = useForm();

  const getImageUrl = (path) => path ? (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '') + path : '';
  const initials = (name) => name ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) : '?';

  const handleOpen = (user = null) => {
    setEditing(user);
    reset(user || { isActive: true, roleId: roles[0]?.id || '' });
    setOpen(true);
  };
  const handleClose = () => { setOpen(false); setEditing(null); reset(); };

  const onSubmit = async (values) => {
    try {
      if (editing) { if (!values.password) delete values.password; await usersApi.update(editing.id, values); }
      else await usersApi.create(values);
      showToast(`User ${editing ? 'updated' : 'created'} successfully`);
      mutate(); handleClose();
    } catch (err) { showToast(err.response?.data?.message || 'Error saving user', 'error'); }
  };

  const handleDelete = async () => {
    try { await usersApi.remove(deleting.id); showToast('User deleted'); mutate(); }
    catch (err) { showToast(err.response?.data?.message || 'Error deleting user', 'error'); }
    finally { setDeleting(null); }
  };

  if (loading) return <Loader />;

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Typography variant="subtitle1" fontWeight={700} color="text.secondary">
          {data?.meta?.total || 0} users in the system
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <SearchBox value={params.search} onChange={(s) => setParams((p) => ({ ...p, search: s, page: 1 }))} placeholder="Search users…" />
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()} sx={{ borderRadius: 2 }}>Add User</Button>
        </Stack>
      </Stack>

      <DataTable
        mobileKeyField="name"
        columns={[
          { field: 'photo', headerName: '', render: (r) => (
            <Avatar src={getImageUrl(r.profileImagePath)} sx={{ width: 34, height: 34, fontSize: '0.8rem', fontWeight: 700, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
              {initials(r.name)}
            </Avatar>
          )},
          { field: 'name', headerName: 'Name', render: (r) => <Box><Typography variant="body2" fontWeight={700}>{r.name}</Typography><Typography variant="caption" color="text.secondary">{r.email}</Typography></Box> },
          { field: 'mobile', headerName: 'Mobile', render: (r) => r.mobile || '—' },
          { field: 'role', headerName: 'Role', render: (r) => <Chip label={r.role || 'Unknown'} size="small" variant="outlined" color="primary" sx={{ fontWeight: 700, fontSize: '0.7rem' }} /> },
          { field: 'isActive', headerName: 'Status', render: (r) => <Chip label={r.isActive ? 'Active' : 'Inactive'} size="small" color={r.isActive ? 'success' : 'default'} sx={{ fontWeight: 700, fontSize: '0.7rem' }} /> },
          { field: 'actions', headerName: 'Actions', render: (r) => (
            <Stack direction="row" spacing={0.5}>
              <Tooltip title="Edit"><Button size="small" onClick={() => handleOpen(r)} variant="outlined" sx={{ borderRadius: 1.5, minWidth: 0, px: 1.5 }}>Edit</Button></Tooltip>
              <Tooltip title="Delete"><Button size="small" color="error" onClick={() => setDeleting(r)} variant="outlined" sx={{ borderRadius: 1.5, minWidth: 0, px: 1.5 }}>Delete</Button></Tooltip>
            </Stack>
          )},
        ]}
        rows={data?.data || []}
      />
      <Pagination meta={data?.meta} onChangePage={(p) => setParams((pr) => ({ ...pr, page: p }))} onChangeLimit={(l) => setParams((pr) => ({ ...pr, limit: l, page: 1 }))} />

      <Modal open={open} onClose={handleClose} title={editing ? 'Edit User' : 'Add User'}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Stack spacing={2.5} sx={{ pt: 0.5 }}>
            <TextField label="Full Name" fullWidth {...register('name', { required: 'Required' })} error={Boolean(errors.name)} helperText={errors.name?.message} InputLabelProps={{ shrink: true }} />
            <TextField label="Email" type="email" fullWidth {...register('email', { required: 'Required' })} error={Boolean(errors.email)} helperText={errors.email?.message} InputLabelProps={{ shrink: true }} />
            <TextField label="Mobile" fullWidth {...register('mobile')} InputLabelProps={{ shrink: true }} />
            <TextField label="Password" type="password" fullWidth {...register('password', { required: !editing && 'Required', minLength: 6 })} error={Boolean(errors.password)} helperText={errors.password?.message || (editing ? 'Leave blank to keep unchanged' : '')} InputLabelProps={{ shrink: true }} />
            <TextField select label="Role" fullWidth {...register('roleId', { required: 'Required' })} error={Boolean(errors.roleId)} helperText={errors.roleId?.message} defaultValue="">
              {roles.map((r) => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
            </TextField>
            <FormControlLabel control={<Switch {...register('isActive')} defaultChecked />} label="Active User" />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={handleClose} variant="outlined" sx={{ borderRadius: 2 }}>Cancel</Button>
              <Button type="submit" variant="contained" sx={{ borderRadius: 2 }}>
                {editing ? 'Update User' : 'Create User'}
              </Button>
            </Stack>
          </Stack>
        </form>
      </Modal>

      <ConfirmDialog open={Boolean(deleting)} title="Delete User" message={`Delete user "${deleting?.name}"? This cannot be undone.`} onCancel={() => setDeleting(null)} onConfirm={handleDelete} />
    </Stack>
  );
}

/* ──────────────────── MAIN EXPORT ──────────────────── */
export default function Users() {
  const [tab, setTab] = useState(0);

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title="Users & Role Management"
        subtitle="Manage system users, assign roles and configure access permissions"
        icon={<GroupIcon />}
      />

      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ px: 2, borderBottom: 1, borderColor: 'divider', bgcolor: (t) => alpha(t.palette.primary.main, 0.03) }}
        >
          <Tab icon={<GroupIcon fontSize="small" />} iconPosition="start" label="Users" />
          <Tab icon={<ShieldIcon fontSize="small" />} iconPosition="start" label="Roles & Permissions" />
        </Tabs>
        <Box sx={{ p: { xs: 1.5, sm: 2.5 } }}>
          {tab === 0 && <UserManager />}
          {tab === 1 && <RoleManager />}
        </Box>
      </Paper>
    </Stack>
  );
}

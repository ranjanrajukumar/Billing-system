import React, { useState } from 'react';
import {
  Button, Card, CardContent, Chip, Stack, Typography, Tab, Tabs, Box, Checkbox, Paper
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import { useFetch } from '../hooks/useFetch.js';
import { usersApi } from '../services/resource.service.js';
import { useForm, Controller } from 'react-hook-form';
import { TextField, MenuItem, FormControlLabel, Switch } from '@mui/material';
import { useToast } from '../context/ToastContext.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

const modules = [
  { id: 'users', label: 'User Management' },
  { id: 'roles', label: 'Role & Permissions' },
  { id: 'masters', label: 'Master Data' },
  { id: 'inventory', label: 'Inventory Management' },
  { id: 'purchases', label: 'Purchase Management' },
  { id: 'sales', label: 'Sales & Billing' },
  { id: 'accounts', label: 'Accounts & Ledgers' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'System Settings' }
];

const actionsList = ['view', 'create', 'edit', 'delete'];

function RoleManager() {
  const { data, loading, error, mutate } = useFetch(() => usersApi.roles.list(), []);
  const roles = Array.isArray(data) ? data : (data?.data || []);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const { showToast } = useToast();
  
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, control, watch } = useForm();

  const handleOpen = (role = null) => {
    setEditingRole(role);
    const defaultPermissions = {};
    modules.forEach(m => {
      defaultPermissions[m.id] = { view: false, create: false, edit: false, delete: false };
    });
    
    reset(role ? {
      name: role.name,
      permissions: { ...defaultPermissions, ...role.permissions }
    } : { name: '', permissions: defaultPermissions });
    
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setEditingRole(null);
    reset();
  };

  const onSubmit = async (values) => {
    try {
      if (editingRole) {
        await usersApi.roles.update(editingRole.id, values);
        showToast('Role updated successfully', 'success');
      } else {
        await usersApi.roles.create(values);
        showToast('Role created successfully', 'success');
      }
      mutate();
      handleClose();
    } catch (err) {
      showToast(err.response?.data?.message || 'Error saving role', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await usersApi.roles.remove(deleteConfirm.id);
      showToast('Role deleted successfully', 'success');
      mutate();
    } catch (err) {
      showToast(err.response?.data?.message || 'Error deleting role', 'error');
    } finally {
      setDeleteConfirm(null);
    }
  };

  const columns = [
    { field: 'name', headerName: 'Role Name' },
    { field: 'permissions', headerName: 'Access Overview', render: (row) => {
        if (row.name === 'Admin') return <Chip size="small" label="Full Access" color="primary" />;
        const p = row.permissions || {};
        const count = Object.values(p).filter(v => v.view).length;
        return `${count} Modules Enabled`;
      }
    }
  ];

  const actions = [
    { label: 'Edit', onClick: handleOpen },
    { label: 'Delete', color: 'error', onClick: setDeleteConfirm, disabled: (row) => row.name === 'Admin' }
  ];

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h6">Roles</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>
          Add Role
        </Button>
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <DataTable
            columns={columns}
            rows={roles}
            loading={loading}
            error={error}
            actions={actions}
          />
        </CardContent>
      </Card>

      <Modal open={isModalOpen} onClose={handleClose} title={editingRole ? 'Edit Role' : 'Add Role'} maxWidth="md">
        <form onSubmit={handleSubmit(onSubmit)}>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <TextField
              label="Role Name"
              fullWidth
              disabled={editingRole?.name === 'Admin'}
              {...register('name', { required: 'Role name is required' })}
              error={!!errors.name}
              helperText={errors.name?.message}
            />

            <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                    <th style={{ padding: '12px' }}>Module</th>
                    {actionsList.map(a => (
                      <th key={a} style={{ padding: '12px', textTransform: 'capitalize' }}>{a}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modules.map((m) => (
                    <tr key={m.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 500 }}>{m.label}</td>
                      {actionsList.map(action => (
                        <td key={action} style={{ padding: '4px 12px' }}>
                          <Controller
                            name={`permissions.${m.id}.${action}`}
                            control={control}
                            render={({ field }) => (
                              <Checkbox
                                {...field}
                                checked={field.value || false}
                                disabled={editingRole?.name === 'Admin'}
                                color="primary"
                              />
                            )}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Paper>

            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button onClick={handleClose}>Cancel</Button>
              <Button type="submit" variant="contained" disabled={isSubmitting}>Save</Button>
            </Stack>
          </Stack>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete Role"
        message={`Are you sure you want to delete the ${deleteConfirm?.name} role?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </Stack>
  );
}

function UserManager() {
  const [params, setParams] = useState({ page: 1, limit: 10, search: '' });
  const { data, loading, error, mutate } = useFetch(() => usersApi.list(params), [params]);
  const { data: rolesResponse } = useFetch(() => usersApi.roles.list(), []);
  const roles = Array.isArray(rolesResponse) ? rolesResponse : (rolesResponse?.data || []);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const { showToast } = useToast();
  
  const { register, handleSubmit, formState: { errors }, reset } = useForm();

  const handleOpen = (user = null) => {
    setEditingUser(user);
    reset(user || { isActive: true, roleId: roles[0]?.id || '' });
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    reset();
  };

  const onSubmit = async (values) => {
    try {
      if (editingUser) {
        if (!values.password) delete values.password;
        await usersApi.update(editingUser.id, values);
        showToast('User updated successfully', 'success');
      } else {
        await usersApi.create(values);
        showToast('User created successfully', 'success');
      }
      mutate();
      handleClose();
    } catch (err) {
      showToast(err.response?.data?.message || 'Error saving user', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await usersApi.remove(deleteConfirm.id);
      showToast('User deleted successfully', 'success');
      mutate();
    } catch (err) {
      showToast(err.response?.data?.message || 'Error deleting user', 'error');
    } finally {
      setDeleteConfirm(null);
    }
  };

  const columns = [
    { field: 'name', headerName: 'Name' },
    { field: 'email', headerName: 'Email' },
    { field: 'mobile', headerName: 'Mobile' },
    { field: 'role', headerName: 'Role', render: (row) => row.role || 'Unknown' },
    { field: 'isActive', headerName: 'Status', render: (row) => (
        <Chip label={row.isActive ? 'Active' : 'Inactive'} color={row.isActive ? 'success' : 'default'} size="small" />
      ) 
    }
  ];

  const actions = [
    { label: 'Edit', onClick: handleOpen },
    { label: 'Delete', color: 'error', onClick: setDeleteConfirm }
  ];

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h6">Users</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>
          Add User
        </Button>
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <DataTable
            columns={columns}
            rows={data?.data}
            loading={loading}
            error={error}
            actions={actions}
            onSearch={(search) => setParams(p => ({ ...p, search, page: 1 }))}
            pagination={{
              page: params.page,
              limit: params.limit,
              total: data?.total || 0,
              onPageChange: (page) => setParams(p => ({ ...p, page })),
              onLimitChange: (limit) => setParams(p => ({ ...p, limit, page: 1 }))
            }}
          />
        </CardContent>
      </Card>

      <Modal open={isModalOpen} onClose={handleClose} title={editingUser ? 'Edit User' : 'Add User'}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              fullWidth
              {...register('name', { required: 'Name is required' })}
              error={!!errors.name}
              helperText={errors.name?.message}
            />
            <TextField
              label="Email"
              type="email"
              fullWidth
              {...register('email', { required: 'Email is required' })}
              error={!!errors.email}
              helperText={errors.email?.message}
            />
            <TextField
              label="Mobile"
              fullWidth
              {...register('mobile')}
            />
            <TextField
              label="Password"
              type="password"
              fullWidth
              {...register('password', { required: !editingUser ? 'Password is required' : false, minLength: 6 })}
              error={!!errors.password}
              helperText={errors.password?.message || (editingUser ? 'Leave blank to keep unchanged' : '')}
            />
            <TextField
              select
              label="Role"
              fullWidth
              {...register('roleId', { required: 'Role is required' })}
              error={!!errors.roleId}
              helperText={errors.roleId?.message}
              defaultValue=""
            >
              {roles.map(role => (
                <MenuItem key={role.id} value={role.id}>{role.name}</MenuItem>
              ))}
            </TextField>
            <FormControlLabel
              control={<Switch {...register('isActive')} defaultChecked />}
              label="Active User"
            />
            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button onClick={handleClose}>Cancel</Button>
              <Button type="submit" variant="contained">Save</Button>
            </Stack>
          </Stack>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete User"
        message={`Are you sure you want to delete ${deleteConfirm?.name}?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </Stack>
  );
}

export default function Users() {
  const [tab, setTab] = useState(0);

  return (
    <Stack spacing={3}>
      <Typography variant="h4">User & Role Management</Typography>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Users" />
          <Tab label="Roles & Permissions" />
        </Tabs>
      </Box>
      {tab === 0 && <UserManager />}
      {tab === 1 && <RoleManager />}
    </Stack>
  );
}

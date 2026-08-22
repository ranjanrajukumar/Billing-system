import { useState, useEffect } from 'react';
import { Box, Button, Typography, Paper, Tooltip, IconButton, Chip, Stack } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FileCopyIcon from '@mui/icons-material/FileCopy';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import ViewQuiltIcon from '@mui/icons-material/ViewQuilt';
import { useNavigate } from 'react-router-dom';
import DataTable from '../../components/DataTable';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import TemplateFormModal from './TemplateFormModal.jsx';
import Pagination from '../../components/Pagination';
import { confirmAction } from '../../utils/alerts.js';

export default function InvoiceTemplateSetup() {
  const [data, setData] = useState({ data: [], total: 0 });
  const [params, setParams] = useState({ page: 1, search: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const loadData = async () => {
    try {
      const res = await api.get('/invoice-templates', { params });
      // Every list endpoint answers { data, meta } — read it the same way here.
      const meta = res.data.meta || {};
      setData({
        data: res.data.data || [],
        total: meta.total || 0,
        meta: {
          page: meta.page || 1,
          limit: meta.limit || 10,
          total: meta.total || 0,
          pages: meta.pages || 1
        }
      });
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to load templates', 'error');
    }
  };

  useEffect(() => { loadData(); }, [params]);

  const handleDelete = async (id) => {
    const confirmed = await confirmAction({
      title: 'Delete this template?',
      text: 'Invoices already created keep their layout; only future ones are affected.',
      confirmText: 'Yes, delete it',
    });
    if (!confirmed) return;
    try {
      await api.delete(`/invoice-templates/${id}`);
      showToast('Template deleted', 'success');
      loadData();
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to delete template', 'error');
    }
  };

  const handleDuplicate = async (id) => {
    try {
      await api.post(`/invoice-templates/${id}/duplicate`);
      showToast('Template duplicated successfully', 'success');
      loadData();
    } catch (error) {
      showToast('Failed to duplicate template', 'error');
    }
  };

  const handleSetDefault = async (id) => {
    try {
      await api.put(`/invoice-templates/${id}/set-default`);
      showToast('Default template updated', 'success');
      loadData();
    } catch (error) {
      showToast('Failed to set default template', 'error');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Invoice Format Setup</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditingTemplate(null); setModalOpen(true); }}>
          New Template
        </Button>
      </Box>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <DataTable
          columns={[
            { field: 'templateName', headerName: 'Template Name' },
            { field: 'paperSize', headerName: 'Paper Size' },
            { field: 'orientation', headerName: 'Orientation' },
            { field: 'isDefault', headerName: 'Default', render: (row) => row.isDefault ? <Chip label="Default" color="primary" size="small" /> : null },
            { field: 'isActive', headerName: 'Status', render: (row) => row.isActive ? <Chip label="Active" color="success" size="small" /> : <Chip label="Inactive" color="default" size="small" /> },
            {
              field: 'actions',
              headerName: 'Actions',
              render: (row) => (
                <Box>
                  <Tooltip title={row.isDefault ? "Current Default" : "Set as Default"}>
                    <IconButton size="small" color={row.isDefault ? "primary" : "default"} onClick={() => handleSetDefault(row.id)}>
                      {row.isDefault ? <StarIcon /> : <StarBorderIcon />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Design layout">
                    <IconButton size="small" color="primary" onClick={() => navigate(`/invoice-templates/${row.id}/design`)}>
                      <ViewQuiltIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Edit">
                    <IconButton size="small" color="primary" onClick={() => { setEditingTemplate(row); setModalOpen(true); }}>
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Duplicate">
                    <IconButton size="small" color="secondary" onClick={() => handleDuplicate(row.id)}>
                      <FileCopyIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => handleDelete(row.id)}>
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
              )
            }
          ]}
          rows={data.data}
          meta={data.meta}
        />
        <Stack sx={{ mt: 2 }}>
          <Pagination
            meta={data.meta}
            onChangePage={(page) => setParams({ ...params, page })}
            onChangeLimit={(limit) => setParams({ ...params, limit, page: 1 })}
          />
        </Stack>
      </Paper>

      {modalOpen && (
        <TemplateFormModal
          open={modalOpen}
          template={editingTemplate}
          onClose={() => setModalOpen(false)}
          onSave={() => { setModalOpen(false); loadData(); }}
        />
      )}
    </Box>
  );
}

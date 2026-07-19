import { useState, useEffect } from 'react';
import { Box, Button, Typography, Paper, Tooltip, IconButton, Chip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FileCopyIcon from '@mui/icons-material/FileCopy';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import DataTable from '../components/DataTable';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import TemplateFormModal from '../components/TemplateFormModal';

export default function InvoiceTemplateSetup() {
  const [data, setData] = useState({ data: [], total: 0 });
  const [params, setParams] = useState({ page: 1, search: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const { showToast } = useToast();

  const loadData = async () => {
    try {
      const res = await api.get('/invoice-templates', { params });
      setData(res.data);
    } catch (error) {
      showToast('Failed to load templates', 'error');
    }
  };

  useEffect(() => { loadData(); }, [params]);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
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

      <Paper sx={{ p: 2 }}>
        <DataTable
          columns={[
            { field: 'templateName', label: 'Template Name' },
            { field: 'paperSize', label: 'Paper Size' },
            { field: 'orientation', label: 'Orientation' },
            { field: 'isDefault', label: 'Default', render: (val) => val ? <Chip label="Default" color="primary" size="small" /> : null },
            { field: 'isActive', label: 'Status', render: (val) => val ? <Chip label="Active" color="success" size="small" /> : <Chip label="Inactive" color="default" size="small" /> },
            {
              field: 'actions',
              label: 'Actions',
              render: (_, row) => (
                <Box>
                  <Tooltip title={row.isDefault ? "Current Default" : "Set as Default"}>
                    <IconButton size="small" color={row.isDefault ? "primary" : "default"} onClick={() => handleSetDefault(row.id)}>
                      {row.isDefault ? <StarIcon /> : <StarBorderIcon />}
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
          data={data.data}
          total={data.total}
          page={params.page}
          onPageChange={(page) => setParams({ ...params, page })}
          onSearch={(search) => setParams({ ...params, search, page: 1 })}
        />
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

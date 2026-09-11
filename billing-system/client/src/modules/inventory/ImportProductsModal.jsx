import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Stack, Typography, Box, CircularProgress, Alert, LinearProgress
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';
import { useEffect, useState, useRef } from 'react';
import { productsApi } from '../../services/resource.service';
import { useToast } from '../../context/ToastContext';

export default function ImportProductsModal({ open, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const { showToast } = useToast();
  const fileInputRef = useRef();

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setResult(null);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await productsApi.import(formData);
      setResult(res.job);
      showToast('Import queued. You can keep working while products are processed.', 'info');
    } catch (err) {
      showToast(err.response?.data?.message || 'Error importing products', 'error');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (!result?.id || !['Queued', 'Processing'].includes(result.status)) return undefined;
    const poll = async () => {
      try {
        const job = await productsApi.importStatus(result.id);
        setResult(job);
        if (['Completed', 'CompletedWithErrors'].includes(job.status)) {
          if (job.successCount > 0) onImported();
          showToast(`Import finished: ${job.successCount} products processed.`, job.errorCount ? 'warning' : 'success');
        }
      } catch {
        showToast('Unable to refresh import progress', 'error');
      }
    };
    poll();
    const interval = window.setInterval(poll, 1500);
    return () => window.clearInterval(interval);
  }, [result?.id, result?.status]);

  const downloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "ProductName,SKU,Barcode,PurchasePrice,SellingPrice,GSTPercent,Stock,HSNCode,PrimaryUnit,Category\n"
      + "Example Product,SKU1001,10001000,10.50,15.00,18,50,1234,PCS,General";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Product_Import_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClose = () => {
    setFile(null);
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={uploading ? undefined : handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Import Products</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <Alert severity="info" action={
            <Button color="inherit" size="small" startIcon={<DownloadIcon />} onClick={downloadTemplate}>
              Template
            </Button>
          }>
            Upload an Excel (.xlsx) or CSV file. CSV is recommended for very large catalogues.
          </Alert>

          <Box
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current.click()}
            sx={{
              border: '2px dashed',
              borderColor: file ? 'primary.main' : 'divider',
              borderRadius: 2,
              p: 4,
              textAlign: 'center',
              cursor: uploading ? 'wait' : 'pointer',
              bgcolor: file ? 'primary.50' : 'transparent',
              transition: 'all 0.2s ease',
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: 'action.hover'
              }
            }}
          >
            <input
              type="file"
              accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{ display: 'none' }}
              disabled={uploading}
            />
            <CloudUploadIcon sx={{ fontSize: 48, color: file ? 'primary.main' : 'text.secondary', mb: 1 }} />
            <Typography variant="h6" color={file ? 'primary.main' : 'text.primary'}>
              {file ? file.name : 'Click or drag file to upload'}
            </Typography>
            {!file && (
              <Typography variant="body2" color="text.secondary">
                Supports .xlsx and .csv files
              </Typography>
            )}
          </Box>

          {result && (
            <Stack spacing={1}>
              {['Queued', 'Processing'].includes(result.status) && (
                <Alert severity="info">
                  <Stack spacing={1}>
                    <Typography variant="body2">{result.message || 'Preparing import'}</Typography>
                    <LinearProgress />
                    <Typography variant="caption">{Number(result.processedRows || 0).toLocaleString()} rows processed</Typography>
                  </Stack>
                </Alert>
              )}
              {result.status === 'Completed' && (
                <Alert severity="success">
                  Successfully imported or updated {Number(result.successCount || 0).toLocaleString()} products.
                </Alert>
              )}
              {(result.status === 'CompletedWithErrors' || result.status === 'Failed') && (
                <Alert severity="error">
                  {result.status === 'Failed' ? result.message : `Imported ${Number(result.successCount || 0).toLocaleString()} products with ${Number(result.errorCount || 0).toLocaleString()} errors.`}
                  {result.errors?.length > 0 && <Box sx={{ maxHeight: 100, overflow: 'auto', mt: 1, fontSize: '0.8rem' }}>
                    {result.errors.map((err, i) => (
                      <div key={i}>{err}</div>
                    ))}
                  </Box>}
                </Alert>
              )}
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={handleClose} disabled={uploading}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleImport}
          disabled={!file || uploading}
          startIcon={uploading ? <CircularProgress size={20} /> : <CloudUploadIcon />}
        >
          {uploading ? 'Importing...' : 'Import'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

import { useState, useEffect } from 'react';
import { Box, Button, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Divider, IconButton, Paper, Stack, TextField, Grid, FormControlLabel, Switch, Tab, Tabs, MenuItem, Select, InputLabel, FormControl, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

function TabPanel(props) {
  const { children, value, index, ...other } = props;
  return <div role="tabpanel" hidden={value !== index} {...other}>{value === index && <Box sx={{ p: 2 }}>{children}</Box>}</div>;
}

const layoutTags = [
  { key: 'companyHeader', label: 'Company Header', sample: 'Company name, logo, GSTIN, address' },
  { key: 'invoiceTitle', label: 'Tax Invoice Tag', sample: 'TAX INVOICE' },
  { key: 'invoiceMeta', label: 'Invoice Details', sample: 'Invoice number, date, payment method' },
  { key: 'customerBlock', label: 'Customer Details', sample: 'Bill to, address, GSTIN' },
  { key: 'itemsTable', label: 'Product Table', sample: 'Items, HSN, qty, rate, GST, amount' },
  { key: 'taxSummary', label: 'Tax Summary', sample: 'Subtotal, CGST, SGST, IGST, round off' },
  { key: 'amountWords', label: 'Amount In Words', sample: 'Grand total in words' },
  { key: 'qrCode', label: 'QR Code', sample: 'Payment or invoice QR' },
  { key: 'bankDetails', label: 'Bank Details', sample: 'Bank, A/C, IFSC, UPI' },
  { key: 'signature', label: 'Signature', sample: 'Authorized signatory' },
  { key: 'footer', label: 'Footer Terms', sample: 'Declaration, notes, footer message' }
];

const defaultDesignLayout = [
  'companyHeader',
  'invoiceTitle',
  'invoiceMeta',
  'customerBlock',
  'itemsTable',
  'taxSummary',
  'amountWords',
  'qrCode',
  'signature',
  'footer'
].map((key) => ({ id: `${key}-${Date.now()}-${Math.random()}`, key }));

function tagByKey(key) {
  return layoutTags.find((tag) => tag.key === key) || layoutTags[0];
}

export default function TemplateFormModal({ open, template, onClose, onSave }) {
  const { showToast } = useToast();
  const [tab, setTab] = useState(0);
  const [formData, setFormData] = useState({
    templateName: '',
    invoiceTitle: 'TAX INVOICE',
    isDefault: false,
    isActive: true,
    designLayout: defaultDesignLayout,
    companyName: '', companyLogo: '', gstNumber: '', panNumber: '', address: '', city: '', state: '', pincode: '', phoneNumber: '', email: '', website: '',
    invoicePrefix: 'INV-', invoiceSuffix: '', nextNumber: 1, financialYear: '', autoNumbering: true, resetYearly: false,
    enableGst: true, gstType: 'CGST/SGST', showGstNumber: true, showHsnCode: true, showTaxSummary: true, roundOffMethod: 'Nearest',
    paperSize: 'A4', orientation: 'Portrait', showCompanyLogo: true, showQrCode: true, showBarcode: false, showCustomerGst: true, showBillingAddress: true, showShippingAddress: false, showProductCode: false, showProductImage: false, showUnit: false, showDiscount: true, showTaxColumns: true, showSerialNumber: true, showFooter: true, showSignature: true, showTerms: true, showWatermark: false,
    footerMessage: '', declaration: '', bankName: '', accountNumber: '', ifscCode: '', upiId: '', authorizedSignatory: ''
  });

  useEffect(() => {
    if (template) {
      setFormData((prev) => ({
        ...prev,
        ...template,
        invoiceTitle: template.invoiceTitle || 'TAX INVOICE',
        designLayout: Array.isArray(template.designLayout) && template.designLayout.length ? template.designLayout : defaultDesignLayout
      }));
    }
  }, [template]);

  const handleChange = (e) => {
    const { name, value, checked, type } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const addLayoutBlock = (key) => {
    setFormData((prev) => ({
      ...prev,
      designLayout: [...(prev.designLayout || []), { id: `${key}-${Date.now()}`, key }]
    }));
  };

  const removeLayoutBlock = (id) => {
    setFormData((prev) => ({
      ...prev,
      designLayout: (prev.designLayout || []).filter((block) => block.id !== id)
    }));
  };

  const moveLayoutBlock = (fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    setFormData((prev) => {
      const designLayout = [...(prev.designLayout || [])];
      const [moved] = designLayout.splice(fromIndex, 1);
      designLayout.splice(toIndex, 0, moved);
      return { ...prev, designLayout };
    });
  };

  const handleCanvasDrop = (event, dropIndex = null) => {
    event.preventDefault();
    const tagKey = event.dataTransfer.getData('tagKey');
    const blockIndex = Number(event.dataTransfer.getData('blockIndex'));

    if (tagKey) {
      const block = { id: `${tagKey}-${Date.now()}`, key: tagKey };
      setFormData((prev) => {
        const designLayout = [...(prev.designLayout || [])];
        if (dropIndex === null) designLayout.push(block);
        else designLayout.splice(dropIndex, 0, block);
        return { ...prev, designLayout };
      });
      return;
    }

    if (!Number.isNaN(blockIndex) && dropIndex !== null) moveLayoutBlock(blockIndex, dropIndex);
  };

  const handleSave = async () => {
    try {
      if (template?.id) await api.put(`/invoice-templates/${template.id}`, formData);
      else await api.post('/invoice-templates', formData);
      showToast('Template saved successfully', 'success');
      onSave();
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to save template', 'error');
    }
  };

  const handlePreview = async () => {
    try {
      const res = await api.post('/invoice-templates/sample', formData, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url);
    } catch (error) {
      showToast('Failed to generate preview', 'error');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{template ? 'Edit Template' : 'New Invoice Template'}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tab} onChange={(e, v) => setTab(v)} variant="scrollable">
            <Tab label="General" />
            <Tab label="Company Info" />
            <Tab label="Number Settings" />
            <Tab label="GST Settings" />
            <Tab label="Layout Options" />
            <Tab label="Tax Invoice Designer" />
            <Tab label="Footer Info" />
          </Tabs>
        </Box>

        <TabPanel value={tab} index={0}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={8}>
              <TextField fullWidth label="Template Name" name="templateName" value={formData.templateName} onChange={handleChange} required />
            </Grid>
            <Grid item xs={12} sm={8}>
              <TextField fullWidth label="Invoice Title Tag" name="invoiceTitle" value={formData.invoiceTitle} onChange={handleChange} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControlLabel control={<Switch checked={formData.isActive} onChange={handleChange} name="isActive" />} label="Active" />
              <FormControlLabel control={<Switch checked={formData.isDefault} onChange={handleChange} name="isDefault" />} label="Default" />
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={tab} index={1}>
          <Grid container spacing={2}>
            {['companyName', 'companyLogo', 'gstNumber', 'panNumber', 'address', 'city', 'state', 'pincode', 'phoneNumber', 'email', 'website'].map(field => (
              <Grid item xs={12} sm={field === 'address' ? 12 : 6} key={field}>
                <TextField fullWidth label={field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())} name={field} value={formData[field] || ''} onChange={handleChange} />
              </Grid>
            ))}
          </Grid>
        </TabPanel>

        <TabPanel value={tab} index={2}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}><TextField fullWidth label="Invoice Prefix" name="invoicePrefix" value={formData.invoicePrefix} onChange={handleChange} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth label="Invoice Suffix" name="invoiceSuffix" value={formData.invoiceSuffix} onChange={handleChange} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth label="Next Number" name="nextNumber" type="number" value={formData.nextNumber} onChange={handleChange} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth label="Financial Year" name="financialYear" value={formData.financialYear} onChange={handleChange} placeholder="e.g. 23-24" /></Grid>
            <Grid item xs={12} sm={6}><FormControlLabel control={<Switch checked={formData.autoNumbering} onChange={handleChange} name="autoNumbering" />} label="Auto Numbering" /></Grid>
            <Grid item xs={12} sm={6}><FormControlLabel control={<Switch checked={formData.resetYearly} onChange={handleChange} name="resetYearly" />} label="Reset Every Financial Year" /></Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={tab} index={3}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}><FormControlLabel control={<Switch checked={formData.enableGst} onChange={handleChange} name="enableGst" />} label="Enable GST" /></Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>GST Type</InputLabel>
                <Select name="gstType" value={formData.gstType} onChange={handleChange} label="GST Type">
                  <MenuItem value="CGST/SGST">CGST/SGST</MenuItem>
                  <MenuItem value="IGST">IGST</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}><FormControlLabel control={<Switch checked={formData.showGstNumber} onChange={handleChange} name="showGstNumber" />} label="Show GST Number" /></Grid>
            <Grid item xs={12} sm={6}><FormControlLabel control={<Switch checked={formData.showHsnCode} onChange={handleChange} name="showHsnCode" />} label="Show HSN/SAC Code" /></Grid>
            <Grid item xs={12} sm={6}><FormControlLabel control={<Switch checked={formData.showTaxSummary} onChange={handleChange} name="showTaxSummary" />} label="Show Tax Summary" /></Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Round-Off Method</InputLabel>
                <Select name="roundOffMethod" value={formData.roundOffMethod} onChange={handleChange} label="Round-Off Method">
                  <MenuItem value="Nearest">Nearest</MenuItem>
                  <MenuItem value="Up">Up</MenuItem>
                  <MenuItem value="Down">Down</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={tab} index={4}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Paper Size</InputLabel>
                <Select name="paperSize" value={formData.paperSize} onChange={handleChange} label="Paper Size">
                  <MenuItem value="A4">A4</MenuItem>
                  <MenuItem value="A5">A5</MenuItem>
                  <MenuItem value="80mm Thermal">80mm Thermal</MenuItem>
                  <MenuItem value="58mm Thermal">58mm Thermal</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Orientation</InputLabel>
                <Select name="orientation" value={formData.orientation} onChange={handleChange} label="Orientation">
                  <MenuItem value="Portrait">Portrait</MenuItem>
                  <MenuItem value="Landscape">Landscape</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            {['showCompanyLogo', 'showQrCode', 'showBarcode', 'showCustomerGst', 'showBillingAddress', 'showShippingAddress', 'showProductCode', 'showProductImage', 'showUnit', 'showDiscount', 'showTaxColumns', 'showSerialNumber', 'showFooter', 'showSignature', 'showTerms', 'showWatermark'].map(field => (
              <Grid item xs={12} sm={4} key={field}>
                <FormControlLabel control={<Switch checked={formData[field]} onChange={handleChange} name={field} />} label={field.replace('show', '').replace(/([A-Z])/g, ' $1').trim()} />
              </Grid>
            ))}
          </Grid>
        </TabPanel>

        <TabPanel value={tab} index={5}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <Stack spacing={1}>
                <Typography variant="h6">Tags</Typography>
                {layoutTags.map((tag) => (
                  <Paper
                    key={tag.key}
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData('tagKey', tag.key)}
                    variant="outlined"
                    sx={{ p: 1.25, cursor: 'grab' }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center">
                      <DragIndicatorIcon color="action" fontSize="small" />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={700}>{tag.label}</Typography>
                        <Typography variant="caption" color="text.secondary">{tag.sample}</Typography>
                      </Box>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Grid>
            <Grid item xs={12} md={8}>
              <Paper
                variant="outlined"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleCanvasDrop(event)}
                sx={{ minHeight: 560, p: 2, bgcolor: 'background.default' }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Typography variant="h6">A4 Preview</Typography>
                  <Button type="button" size="small" onClick={() => setFormData((prev) => ({ ...prev, designLayout: defaultDesignLayout }))}>Reset</Button>
                </Stack>
                <Box sx={{ maxWidth: 560, mx: 'auto', bgcolor: 'background.paper', border: 1, borderColor: 'divider', minHeight: 500, p: 2 }}>
                  {(formData.designLayout || []).map((block, index) => {
                    const tag = tagByKey(block.key);
                    return (
                      <Paper
                        key={block.id}
                        draggable
                        onDragStart={(event) => event.dataTransfer.setData('blockIndex', String(index))}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => handleCanvasDrop(event, index)}
                        variant="outlined"
                        sx={{ p: 1.25, mb: 1, borderStyle: block.key === 'invoiceTitle' ? 'solid' : 'dashed' }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center">
                          <DragIndicatorIcon color="action" fontSize="small" />
                          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Typography variant={block.key === 'invoiceTitle' ? 'h6' : 'body2'} fontWeight={700}>
                                {block.key === 'invoiceTitle' ? formData.invoiceTitle || tag.label : tag.label}
                              </Typography>
                              {block.key === 'invoiceTitle' && <Chip label="Tag" color="primary" size="small" variant="outlined" />}
                            </Stack>
                            <Typography variant="caption" color="text.secondary">{tag.sample}</Typography>
                          </Box>
                          <IconButton type="button" size="small" color="error" onClick={() => removeLayoutBlock(block.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      </Paper>
                    );
                  })}
                  {!(formData.designLayout || []).length && (
                    <Box sx={{ minHeight: 220, display: 'grid', placeItems: 'center', border: 1, borderStyle: 'dashed', borderColor: 'divider' }}>
                      <Typography color="text.secondary">Drop invoice tags here</Typography>
                    </Box>
                  )}
                </Box>
                <Divider sx={{ my: 2 }} />
                <Stack direction="row" gap={1} flexWrap="wrap">
                  {layoutTags.map((tag) => <Chip key={tag.key} label={`Add ${tag.label}`} onClick={() => addLayoutBlock(tag.key)} variant="outlined" />)}
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={tab} index={6}>
          <Grid container spacing={2}>
            {['footerMessage', 'declaration', 'bankName', 'accountNumber', 'ifscCode', 'upiId', 'authorizedSignatory'].map(field => (
              <Grid item xs={12} sm={field === 'footerMessage' || field === 'declaration' ? 12 : 6} key={field}>
                <TextField fullWidth multiline={field === 'footerMessage' || field === 'declaration'} rows={field === 'declaration' ? 3 : 1} label={field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())} name={field} value={formData[field] || ''} onChange={handleChange} />
              </Grid>
            ))}
          </Grid>
        </TabPanel>
      </DialogContent>
      <DialogActions>
        <Button type="button" onClick={handlePreview} color="info">Live Preview</Button>
        <Box sx={{ flexGrow: 1 }} />
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="button" onClick={handleSave} variant="contained" disabled={!formData.templateName}>Save Template</Button>
      </DialogActions>
    </Dialog>
  );
}

import { useState, useEffect } from 'react';
import { Box, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Grid, FormControlLabel, Switch, Tab, Tabs, MenuItem, Select, InputLabel, FormControl } from '@mui/material';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

function TabPanel(props) {
  const { children, value, index, ...other } = props;
  return <div role="tabpanel" hidden={value !== index} {...other}>{value === index && <Box sx={{ p: 2 }}>{children}</Box>}</div>;
}

export default function TemplateFormModal({ open, template, onClose, onSave }) {
  const { showToast } = useToast();
  const [tab, setTab] = useState(0);
  const [formData, setFormData] = useState({
    templateName: '',
    isDefault: false,
    isActive: true,
    companyName: '', companyLogo: '', gstNumber: '', panNumber: '', address: '', city: '', state: '', pincode: '', phoneNumber: '', email: '', website: '',
    invoicePrefix: 'INV-', invoiceSuffix: '', nextNumber: 1, financialYear: '', autoNumbering: true, resetYearly: false,
    enableGst: true, gstType: 'CGST/SGST', showGstNumber: true, showHsnCode: true, showTaxSummary: true, roundOffMethod: 'Nearest',
    paperSize: 'A4', orientation: 'Portrait', showCompanyLogo: true, showQrCode: true, showBarcode: false, showCustomerGst: true, showBillingAddress: true, showShippingAddress: false, showProductCode: false, showProductImage: false, showUnit: false, showDiscount: true, showTaxColumns: true, showSerialNumber: true, showFooter: true, showSignature: true, showTerms: true, showWatermark: false,
    footerMessage: '', declaration: '', bankName: '', accountNumber: '', ifscCode: '', upiId: '', authorizedSignatory: ''
  });

  useEffect(() => {
    if (template) setFormData({ ...formData, ...template });
  }, [template]);

  const handleChange = (e) => {
    const { name, value, checked, type } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
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
            <Tab label="Footer Info" />
          </Tabs>
        </Box>

        <TabPanel value={tab} index={0}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={8}>
              <TextField fullWidth label="Template Name" name="templateName" value={formData.templateName} onChange={handleChange} required />
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
            {['footerMessage', 'declaration', 'bankName', 'accountNumber', 'ifscCode', 'upiId', 'authorizedSignatory'].map(field => (
              <Grid item xs={12} sm={field === 'footerMessage' || field === 'declaration' ? 12 : 6} key={field}>
                <TextField fullWidth multiline={field === 'footerMessage' || field === 'declaration'} rows={field === 'declaration' ? 3 : 1} label={field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())} name={field} value={formData[field] || ''} onChange={handleChange} />
              </Grid>
            ))}
          </Grid>
        </TabPanel>
      </DialogContent>
      <DialogActions>
        <Button onClick={handlePreview} color="info">Live Preview</Button>
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!formData.templateName}>Save Template</Button>
      </DialogActions>
    </Dialog>
  );
}

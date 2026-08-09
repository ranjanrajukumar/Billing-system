import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import PrintIcon from '@mui/icons-material/Print';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import ViewQuiltIcon from '@mui/icons-material/ViewQuilt';
import {
  alpha, Box, Button, Checkbox, Chip, Divider, FormControlLabel,
  Grid, IconButton, Paper, Stack, TextField, Tooltip, Typography, useTheme,
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Loader from '../components/Loader.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api from '../services/api.js';

const OPTION_LABELS = {
  showLogo: 'Logo',
  showGst: 'GST number',
  showAddress: 'Address',
  showSerial: 'Serial no.',
  showHsn: 'HSN code',
  showDiscount: 'Discount',
  showTaxBreakup: 'Tax breakdown',
  showRoundOff: 'Round off',
};

let blockCounter = 0;
const newBlockId = () => `b${Date.now()}${blockCounter++}`;

export default function InvoiceDesigner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const { showToast } = useToast();

  const [template, setTemplate] = useState(null);
  const [palette, setPalette] = useState([]);
  const [layout, setLayout] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const dragFrom = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const [tpl, blocks] = await Promise.all([
          api.get(`/invoice-templates/${id}`).then((r) => r.data),
          api.get('/invoice-templates/blocks').then((r) => r.data),
        ]);
        setTemplate(tpl);
        setPalette(blocks.blocks || []);
        const existing = Array.isArray(tpl.designLayout) && tpl.designLayout.length
          ? tpl.designLayout
          : blocks.defaultLayout;
        setLayout(existing);
      } catch (err) {
        showToast(err.response?.data?.message || 'Unable to load template', 'error');
      }
      setLoading(false);
    })();
  }, [id]);

  // The server owns rendering, so the preview is exactly what will print.
  const refreshPreview = useCallback(async (nextLayout) => {
    if (!template) return;
    try {
      const html = await api.post(
        '/invoice-templates/html-preview',
        { ...template, designLayout: nextLayout },
        { responseType: 'text' },
      ).then((r) => r.data);
      setPreviewHtml(html);
    } catch (err) {
      showToast(err.response?.data?.message || 'Preview failed', 'error');
    }
  }, [template]);

  useEffect(() => {
    if (!template) return undefined;
    const timer = setTimeout(() => refreshPreview(layout), 300);
    return () => clearTimeout(timer);
  }, [layout, template, refreshPreview]);

  const meta = (type) => palette.find((b) => b.type === type) || { label: type, options: [] };

  const addBlock = (type, atIndex) => {
    const options = Object.fromEntries((meta(type).options || []).map((opt) => [opt, true]));
    const block = { id: newBlockId(), type, ...options };
    setLayout((prev) => {
      const next = [...prev];
      next.splice(atIndex ?? next.length, 0, block);
      return next;
    });
    setSelectedId(block.id);
  };

  const moveBlock = (from, to) => {
    setLayout((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const updateBlock = (blockId, patch) =>
    setLayout((prev) => prev.map((b) => (b.id === blockId ? { ...b, ...patch } : b)));

  const removeBlock = (blockId) => {
    setLayout((prev) => prev.filter((b) => b.id !== blockId));
    setSelectedId((current) => (current === blockId ? null : current));
  };

  const onCanvasDrop = (event, index) => {
    event.preventDefault();
    const source = dragFrom.current;
    dragFrom.current = null;
    if (!source) return;
    if (source.kind === 'palette') addBlock(source.type, index);
    else if (source.index !== index) moveBlock(source.index, index > source.index ? index - 1 : index);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/invoice-templates/${id}`, { ...template, designLayout: layout });
      showToast('Design saved');
    } catch (err) {
      showToast(err.response?.data?.message || 'Unable to save design', 'error');
    }
    setSaving(false);
  };

  const printPreview = () => {
    const frame = document.createElement('iframe');
    Object.assign(frame.style, { position: 'fixed', right: 0, bottom: 0, width: 0, height: 0, border: 0 });
    frame.srcdoc = previewHtml;
    frame.onload = () => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(() => frame.remove(), 60000);
    };
    document.body.appendChild(frame);
  };

  if (loading) return <Loader />;
  if (!template) return <Typography>Template not found.</Typography>;

  const selected = layout.find((b) => b.id === selectedId);

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title={`Design — ${template.templateName}`}
        subtitle="Drag fields onto the canvas, reorder them, and see the invoice update live"
        icon={<ViewQuiltIcon />}
        action={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button startIcon={<ArrowBackIcon />} variant="outlined" onClick={() => navigate('/invoice-templates')}>
              Back
            </Button>
            <Button startIcon={<PrintIcon />} variant="outlined" onClick={printPreview}>
              Print Preview
            </Button>
            <Button startIcon={<SaveIcon />} variant="contained" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save Design'}
            </Button>
          </Stack>
        }
      />

      <Grid container spacing={2}>
        {/* Palette */}
        <Grid item xs={12} md={3}>
          <Paper variant="outlined" sx={{ borderRadius: 3, p: 2 }}>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>Available Fields</Typography>
            <Typography variant="caption" color="text.secondary">Drag onto the canvas, or click to append.</Typography>
            <Stack spacing={1} sx={{ mt: 1.5 }}>
              {palette.map((block) => (
                <Paper
                  key={block.type}
                  variant="outlined"
                  draggable
                  onDragStart={() => { dragFrom.current = { kind: 'palette', type: block.type }; }}
                  onClick={() => addBlock(block.type)}
                  sx={{
                    p: 1.25, borderRadius: 2, cursor: 'grab',
                    '&:hover': { borderColor: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.04) },
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <DragIndicatorIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                    <Box>
                      <Typography variant="body2" fontWeight={700}>{block.label}</Typography>
                      <Typography variant="caption" color="text.secondary">{block.description}</Typography>
                    </Box>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Paper>
        </Grid>

        {/* Canvas */}
        <Grid item xs={12} md={4}>
          <Paper variant="outlined" sx={{ borderRadius: 3, p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle2" fontWeight={700}>Layout</Typography>
              <Tooltip title="Reset to the default layout">
                <IconButton size="small" onClick={() => api.get('/invoice-templates/blocks').then((r) => setLayout(r.data.defaultLayout))}>
                  <RestartAltIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>

            <Stack
              spacing={1}
              sx={{ mt: 1.5, minHeight: 220 }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onCanvasDrop(e, layout.length)}
            >
              {layout.length === 0 && (
                <Box sx={{
                  border: '2px dashed', borderColor: 'divider', borderRadius: 2,
                  p: 3, textAlign: 'center', color: 'text.secondary',
                }}>
                  Drag fields here to build the invoice
                </Box>
              )}

              {layout.map((block, index) => (
                <Paper
                  key={block.id}
                  variant="outlined"
                  draggable
                  onDragStart={() => { dragFrom.current = { kind: 'canvas', index }; }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.stopPropagation(); onCanvasDrop(e, index); }}
                  onClick={() => setSelectedId(block.id)}
                  sx={{
                    p: 1.25, borderRadius: 2, cursor: 'grab',
                    borderColor: selectedId === block.id ? 'primary.main' : 'divider',
                    bgcolor: selectedId === block.id ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <DragIndicatorIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                      <Typography variant="body2" fontWeight={600}>{meta(block.type).label}</Typography>
                    </Stack>
                    <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Paper>
              ))}
            </Stack>

            {selected && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                  {meta(selected.type).label} settings
                </Typography>
                {(meta(selected.type).options || []).map((option) => (
                  <FormControlLabel
                    key={option}
                    control={
                      <Checkbox
                        size="small"
                        checked={Boolean(selected[option])}
                        onChange={(e) => updateBlock(selected.id, { [option]: e.target.checked })}
                      />
                    }
                    label={<Typography variant="body2">{OPTION_LABELS[option] || option}</Typography>}
                  />
                ))}
                {selected.type === 'text' && (
                  <TextField
                    fullWidth size="small" label="Text" multiline minRows={2} sx={{ mt: 1 }}
                    value={selected.text || ''}
                    onChange={(e) => updateBlock(selected.id, { text: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                  />
                )}
                {selected.type === 'spacer' && (
                  <TextField
                    fullWidth size="small" label="Height (px)" type="number" sx={{ mt: 1 }}
                    value={selected.height ?? 16}
                    onChange={(e) => updateBlock(selected.id, { height: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                  />
                )}
                {(meta(selected.type).options || []).length === 0
                  && !['text', 'spacer'].includes(selected.type) && (
                  <Typography variant="caption" color="text.secondary">No settings for this field.</Typography>
                )}
              </>
            )}
          </Paper>
        </Grid>

        {/* Live preview */}
        <Grid item xs={12} md={5}>
          <Paper variant="outlined" sx={{ borderRadius: 3, p: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
              <Typography variant="subtitle2" fontWeight={700}>Live Preview</Typography>
              <Chip label={template.paperSize || 'A4'} size="small" variant="outlined" />
              <Typography variant="caption" color="text.secondary">Sample data</Typography>
            </Stack>
            <Box
              component="iframe"
              title="Invoice preview"
              srcDoc={previewHtml}
              sx={{
                width: '100%', height: { xs: 480, md: 700 },
                border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: '#fff',
              }}
            />
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
}

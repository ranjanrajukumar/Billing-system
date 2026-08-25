import PaletteIcon from '@mui/icons-material/Palette';
import CheckIcon from '@mui/icons-material/Check';
import {
  Alert, Box, Button, Chip, Grid, Paper, Stack, ToggleButton, ToggleButtonGroup,
  Tooltip, Typography, alpha,
} from '@mui/material';
import { useState } from 'react';
import { UI_ACCENTS, UI_DENSITY, UI_RADIUS } from '../../utils/theme.js';
import { UI_FONTS } from '../../utils/theme.js';
import { CARD_STYLES, CONTENT_WIDTHS, DESIGN_PRESETS, SIDEBAR_WIDTHS } from '../../utils/uiPrefs.js';

/**
 * How the application looks, chosen once for the business.
 *
 * Company-wide rather than per-user on purpose: a distributor who wants their
 * own colour and dense stock lists wants that on every terminal in the
 * building, not on whichever one an admin happened to be sitting at. The
 * light/dark switch in the top bar stays personal — this only sets where a new
 * browser starts.
 *
 * The preview is not decoration. Accent, corner style and density are three
 * choices whose combination is genuinely hard to picture, and a settings screen
 * that makes you save and reload to find out what you picked is a settings
 * screen people change once and never touch again.
 */
export default function AppearanceSetup({ value, onChange, onSave, saving }) {
  const [local, setLocal] = useState({
    uiAccent: value?.uiAccent || 'indigo',
    uiRadius: value?.uiRadius || 'rounded',
    uiDensity: value?.uiDensity || 'comfortable',
    uiTheme: value?.uiTheme || 'light',
    uiLayout: value?.uiLayout || 'full',
    uiSidebar: value?.uiSidebar || 'standard',
    uiCards: value?.uiCards || 'outlined',
    uiFont: value?.uiFont || 'inter',
  });

  const set = (patch) => {
    const next = { ...local, ...patch };
    setLocal(next);
    onChange?.(next);
  };

  const accent = UI_ACCENTS[local.uiAccent] || UI_ACCENTS.indigo;
  const radius = UI_RADIUS[local.uiRadius] ?? UI_RADIUS.rounded;
  const density = UI_DENSITY[local.uiDensity] || UI_DENSITY.comfortable;
  const previewDark = local.uiTheme === 'dark';
  const font = UI_FONTS[local.uiFont] || UI_FONTS.inter;

  return (
    <Stack spacing={2.5}>
      <Alert severity="info" sx={{ borderRadius: 2 }}>
        These apply to everyone. Each person can still switch between light and dark themselves —
        this only decides where a new browser starts.
      </Alert>

      {/* ---- Whole looks ---- */}
      <Box>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>Start from a design</Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
          Sets everything below at once. Adjust anything afterwards — a preset is a starting point, not a lock.
        </Typography>
        <Grid container spacing={1.5}>
          {Object.entries(DESIGN_PRESETS).map(([key, preset]) => {
            const chosen = Object.entries(preset.values).every(([k, v]) => local[k] === v);
            const swatch = UI_ACCENTS[preset.values.uiAccent] || UI_ACCENTS.indigo;
            return (
              <Grid item xs={6} sm={4} md={3} key={key}>
                <Paper
                  onClick={() => set(preset.values)}
                  variant="outlined"
                  sx={{
                    p: 1.5, cursor: 'pointer', height: '100%', borderRadius: 2,
                    borderColor: chosen ? swatch.main : 'divider',
                    borderWidth: chosen ? 2 : 1,
                    // A dark preset shown on a white tile is not the design.
                    // The tile carries its own theme so the choice is honest.
                    bgcolor: preset.values.uiTheme === 'dark' ? '#1a1a2e' : 'background.paper',
                    color: preset.values.uiTheme === 'dark' ? '#f1f5f9' : 'text.primary',
                    transition: 'transform 0.15s ease',
                    '&:hover': { transform: 'translateY(-2px)' },
                  }}
                >
                  <Box sx={{
                    height: 28, mb: 1,
                    borderRadius: `${UI_RADIUS[preset.values.uiRadius]}px`,
                    background: `linear-gradient(135deg, ${swatch.main} 0%, ${swatch.dark} 100%)`,
                  }} />
                  <Typography variant="body2" fontWeight={700} sx={{
                    fontFamily: (UI_FONTS[preset.values.uiFont] || UI_FONTS.inter).stack.join(','),
                  }}>
                    {preset.label}
                  </Typography>
                  <Typography variant="caption" sx={{
                    display: 'block', lineHeight: 1.3,
                    color: preset.values.uiTheme === 'dark' ? '#94a3b8' : 'text.secondary',
                  }}>
                    {preset.hint}
                  </Typography>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      </Box>

      {/* ---- Accent ---- */}
      <Box>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>Accent colour</Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
          Used for buttons, links, highlights and the tint under every card.
        </Typography>
        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
          {Object.entries(UI_ACCENTS).map(([key, option]) => (
            <Tooltip title={option.label} key={key}>
              <Box
                onClick={() => set({ uiAccent: key })}
                role="button"
                aria-label={option.label}
                aria-pressed={local.uiAccent === key}
                sx={{
                  width: 44, height: 44, borderRadius: 2, cursor: 'pointer',
                  background: `linear-gradient(135deg, ${option.main} 0%, ${option.dark} 100%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  outline: local.uiAccent === key ? `3px solid ${alpha(option.main, 0.4)}` : 'none',
                  outlineOffset: 2,
                  transition: 'transform 0.15s ease',
                  '&:hover': { transform: 'translateY(-2px)' },
                }}
              >
                {local.uiAccent === key && <CheckIcon sx={{ color: '#fff', fontSize: 20 }} />}
              </Box>
            </Tooltip>
          ))}
        </Stack>
      </Box>

      {/* ---- Corners ---- */}
      <Box>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>Corner style</Typography>
        <ToggleButtonGroup exclusive size="small" value={local.uiRadius}
          onChange={(_e, next) => next && set({ uiRadius: next })}>
          {Object.entries(UI_RADIUS).map(([key, px]) => (
            <ToggleButton key={key} value={key} sx={{ textTransform: 'capitalize', px: 2 }}>
              <Box sx={{
                width: 16, height: 16, mr: 1, borderRadius: `${Math.min(px, 8)}px`,
                border: '2px solid currentColor',
              }} />
              {key}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {/* ---- Density ---- */}
      <Box>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>Row density</Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          Compact fits noticeably more of a stock list on one screen.
        </Typography>
        <ToggleButtonGroup exclusive size="small" value={local.uiDensity}
          onChange={(_e, next) => next && set({ uiDensity: next })}>
          {Object.entries(UI_DENSITY).map(([key, option]) => (
            <ToggleButton key={key} value={key} sx={{ px: 2 }}>{option.label}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {/* ---- Starting theme ---- */}
      <Box>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>Starting theme</Typography>
        <ToggleButtonGroup exclusive size="small" value={local.uiTheme}
          onChange={(_e, next) => next && set({ uiTheme: next })}>
          <ToggleButton value="light" sx={{ px: 2 }}>Light</ToggleButton>
          <ToggleButton value="dark" sx={{ px: 2 }}>Dark</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>Typeface</Typography>
        <ToggleButtonGroup exclusive size="small" value={local.uiFont}
          onChange={(_e, next) => next && set({ uiFont: next })}>
          {Object.entries(UI_FONTS).map(([key, option]) => (
            <ToggleButton key={key} value={key}
              sx={{ px: 2, fontFamily: option.stack.join(',') }}>
              {option.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {/* ---- Layout ---- */}
      <Box>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>Page width</Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          On a wide monitor, a row that runs the full width is harder to follow back to the next line.
        </Typography>
        <ToggleButtonGroup exclusive size="small" value={local.uiLayout}
          onChange={(_e, next) => next && set({ uiLayout: next })}>
          {Object.entries(CONTENT_WIDTHS).map(([key, option]) => (
            <ToggleButton key={key} value={key} sx={{ px: 2 }}>{option.label}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <Box>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>Sidebar width</Typography>
        <ToggleButtonGroup exclusive size="small" value={local.uiSidebar}
          onChange={(_e, next) => next && set({ uiSidebar: next })}>
          {Object.entries(SIDEBAR_WIDTHS).map(([key, option]) => (
            <ToggleButton key={key} value={key} sx={{ px: 2 }}>
              {option.label} <Typography variant="caption" sx={{ ml: 0.75, opacity: 0.7 }}>{option.px}px</Typography>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <Box>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>Panel style</Typography>
        <ToggleButtonGroup exclusive size="small" value={local.uiCards}
          onChange={(_e, next) => next && set({ uiCards: next })}>
          {Object.entries(CARD_STYLES).map(([key, label]) => (
            <ToggleButton key={key} value={key} sx={{ px: 2 }}>{label}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {/* ---- Preview ---- */}
      <Box>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>Preview</Typography>
        <Paper
          variant={local.uiCards === 'outlined' ? 'outlined' : 'elevation'}
          sx={{
            p: 2, borderRadius: `${radius + 2}px`, overflow: 'hidden',
            bgcolor: previewDark ? '#1a1a2e' : '#ffffff',
            border: local.uiCards === 'outlined'
              ? `1px solid ${previewDark ? alpha('#fff', 0.08) : alpha('#000', 0.06)}`
              : 'none',
            boxShadow: local.uiCards === 'elevated'
              ? `0 4px 12px rgba(${accent.rgb},${previewDark ? 0.35 : 0.1})`
              : 'none',
            // Centred at the preview's own scale, so the choice is visible here
            // rather than only after a reload.
            maxWidth: local.uiLayout === 'centered' ? 460 : '100%',
            mx: local.uiLayout === 'centered' ? 'auto' : 0,
            fontFamily: font.stack.join(','),
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <Box sx={{
              px: 2, py: 0.75, borderRadius: `${Math.max(radius - 4, 2)}px`, fontSize: 13, fontWeight: 600,
              color: '#fff', background: `linear-gradient(135deg, ${accent.main} 0%, ${accent.dark} 100%)`,
            }}>
              Save invoice
            </Box>
            <Chip size="small" label="Paid" sx={{
              bgcolor: alpha(accent.main, previewDark ? 0.25 : 0.12),
              color: previewDark ? accent.light : accent.dark,
              fontWeight: 700, borderRadius: `${Math.max(radius - 6, 2)}px`,
            }} />
          </Stack>

          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
            <Box component="thead">
              <Box component="tr">
                {['Product', 'Qty', 'Amount'].map((h) => (
                  <Box component="th" key={h} sx={{
                    textAlign: h === 'Product' ? 'left' : 'right',
                    padding: density.cell, fontSize: '0.7rem', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    color: previewDark ? '#94a3b8' : '#64748b',
                    borderBottom: `2px solid ${alpha(accent.main, 0.08)}`,
                  }}>{h}</Box>
                ))}
              </Box>
            </Box>
            <Box component="tbody">
              {[['Tomato Seeds', '3', '135.00'], ['Urea 50kg', '12', '7,080.00']].map((row) => (
                <Box component="tr" key={row[0]}>
                  {row.map((cell, i) => (
                    <Box component="td" key={cell} sx={{
                      textAlign: i === 0 ? 'left' : 'right',
                      padding: density.cell, fontSize: density.body,
                      color: previewDark ? '#f1f5f9' : '#0f172a',
                      borderBottom: `1px solid ${previewDark ? alpha('#fff', 0.06) : alpha('#000', 0.05)}`,
                    }}>{cell}</Box>
                  ))}
                </Box>
              ))}
            </Box>
          </Box>
        </Paper>
      </Box>

      <Stack direction="row" justifyContent="flex-end">
        <Button variant="contained" onClick={() => onSave?.(local)} disabled={saving}
          startIcon={<PaletteIcon />} sx={{ borderRadius: 2 }}>
          {saving ? 'Saving…' : 'Apply appearance'}
        </Button>
      </Stack>

      <Typography variant="caption" color="text.secondary">
        The new look applies after the page reloads.
      </Typography>
    </Stack>
  );
}

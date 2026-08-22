import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import {
  alpha, Box, Button, Paper, Stack, Tooltip, Typography, useTheme,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import Loader from '../../components/Loader.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { processApi } from '../../services/resource.service.js';

/**
 * The page behind a process menu entry.
 *
 * One row of stages, in the order the work moves through them, each showing how
 * much is sitting there now. The chain is the content: a flat list of screens
 * tells you what exists, and this tells you where things are stuck — which is
 * the only reason to nest the menu in the first place.
 *
 * Everything on screen comes from the server, including which stages this user
 * may open. The page renders whatever it is handed and decides nothing about
 * rights on its own, because a second opinion about rights is how the sidebar
 * and the content end up disagreeing.
 */

/** A stage with work waiting reads warmer than an empty one; zero is good news. */
function toneOf(theme, count, linked) {
  if (!linked) return theme.palette.text.disabled;
  if (!count) return theme.palette.success.main;
  return theme.palette.warning.main;
}

function StageCard({ stage, index, total }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const tone = toneOf(theme, stage.count, stage.linked);
  const waiting = stage.linked && stage.count > 0;

  const card = (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 2,
        height: '100%',
        minWidth: 168,
        flex: '1 1 168px',
        borderColor: waiting ? alpha(tone, 0.4) : 'divider',
        bgcolor: waiting ? alpha(tone, isDark ? 0.12 : 0.06) : 'transparent',
        cursor: stage.linked ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
        '&:hover': stage.linked ? {
          borderColor: alpha(tone, 0.7),
          transform: 'translateY(-2px)',
        } : {},
      }}
    >
      <Stack spacing={0.75}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, letterSpacing: '0.08em', color: 'text.disabled' }}
          >
            {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </Typography>
          {!stage.linked && (
            <Tooltip title="You do not have access to this screen">
              <LockOutlinedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
            </Tooltip>
          )}
        </Stack>

        <Typography sx={{ fontWeight: 800, fontSize: '1.9rem', lineHeight: 1.1, color: tone }}>
          {stage.count}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{stage.label}</Typography>
        <Typography variant="caption" color="text.secondary">{stage.hint}</Typography>
      </Stack>
    </Paper>
  );

  if (!stage.linked) return card;
  return (
    <Box component={RouterLink} to={stage.path} sx={{ textDecoration: 'none', display: 'flex', flex: '1 1 168px' }}>
      {card}
    </Box>
  );
}

export default function ProcessOverview() {
  const { key } = useParams();
  const theme = useTheme();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [process, setProcess] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    processApi.get(key)
      .then((data) => { if (!cancelled) setProcess(data); })
      .catch((err) => {
        if (cancelled) return;
        showToast(err.response?.data?.message || 'Unable to load this process', 'error');
        navigate('/', { replace: true });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    // Re-fetched whenever the process changes: the counts are queue lengths and
    // a stale one is read as a fact and acted on.
    return () => { cancelled = true; };
  }, [key]);

  if (loading) return <Loader />;
  if (!process) return null;

  const busiest = process.stages
    .filter((s) => s.linked && s.count > 0)
    .sort((a, b) => b.count - a.count)[0];

  return (
    <Stack spacing={3} className="animate-fadeInUp">
      <PageHeader
        title={process.title}
        subtitle={process.summary}
        icon={<AccountTreeOutlinedIcon />}
      />

      {busiest ? (
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            borderRadius: 2,
            borderColor: alpha(theme.palette.warning.main, 0.4),
            bgcolor: alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.1 : 0.05),
          }}
        >
          <Typography variant="body2">
            Most work is waiting at <strong>{busiest.label}</strong> — {busiest.count} item(s).
          </Typography>
        </Paper>
      ) : (
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            borderRadius: 2,
            borderColor: alpha(theme.palette.success.main, 0.4),
            bgcolor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.1 : 0.05),
          }}
        >
          <Typography variant="body2">Nothing is waiting anywhere in this process.</Typography>
        </Paper>
      )}

      {/* The chain. Arrows between the cards rather than around them, so the
          direction of the flow is readable before any of the numbers are. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 1,
          flexWrap: 'wrap',
          // Wide chains scroll inside their own row rather than pushing the
          // page sideways.
          overflowX: 'auto',
          pb: 1,
        }}
      >
        {process.stages.map((stage, index) => (
          <Box key={stage.key} sx={{ display: 'contents' }}>
            <StageCard stage={stage} index={index} total={process.stages.length} />
            {index < process.stages.length - 1 && (
              <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.disabled', flexShrink: 0 }}>
                <ArrowForwardIcon fontSize="small" />
              </Box>
            )}
          </Box>
        ))}
      </Box>

      <Box>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
            color: 'text.disabled', display: 'block', mb: 1.5,
          }}
        >
          Documents in this process
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {process.documents.map((document) => (
            <Button
              key={document.key}
              component={RouterLink}
              to={document.path}
              variant="outlined"
              size="small"
              endIcon={<ArrowForwardIcon fontSize="small" />}
              sx={{ borderRadius: 2 }}
            >
              {document.label}
            </Button>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}

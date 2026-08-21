import React from 'react';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';

/**
 * Catches a render-time crash so one broken screen does not take the whole
 * application down.
 *
 * Without this, React unmounts the entire tree on an uncaught render error and
 * the user is left looking at a white page — no menu, no way back, and no hint
 * that anything can be done about it. In a shop that is somebody standing at a
 * counter with a customer waiting.
 *
 * The reset button re-mounts the subtree rather than reloading, so a transient
 * failure (a page rendered against a half-loaded record, say) costs a click
 * instead of a full page load and a fresh round of API calls.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keeps the component stack in the console for whoever is debugging. Point
    // this at a reporting service when there is one.
    console.error('Unhandled render error:', error, info?.componentStack);
  }

  handleReset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // A crash inside the layout would otherwise be re-thrown by the same
    // layout, so this deliberately renders standalone.
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', p: 3 }}>
        <Paper sx={{ p: 4, maxWidth: 560, width: '100%' }}>
          <Stack spacing={2}>
            <Typography variant="h6">Something went wrong on this screen</Typography>
            <Typography variant="body2" color="text.secondary">
              Nothing you had already saved is affected. You can try this screen again, or go
              back to the dashboard and carry on.
            </Typography>

            {import.meta.env.DEV && (
              <Box
                component="pre"
                sx={{
                  m: 0, p: 1.5, borderRadius: 1, bgcolor: 'action.hover',
                  fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap',
                }}
              >
                {error.message}
              </Box>
            )}

            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={this.handleReset}>Try again</Button>
              <Button onClick={() => { window.location.href = '/'; }}>Go to dashboard</Button>
            </Stack>
          </Stack>
        </Paper>
      </Box>
    );
  }
}

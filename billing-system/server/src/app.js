import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes/index.js';
import mediaRoutes from './routes/media.routes.js';
import { errorHandler, notFound } from './middleware/errorMiddleware.js';
import { apiLimiter } from './middleware/rateLimiters.js';
import { requestContext } from './middleware/requestContext.js';

/**
 * Which sites may call this API from a browser.
 *
 * `origin: true` reflects whatever Origin the caller sends, and paired with
 * `credentials: true` that lets any page on the internet make authenticated
 * requests with a signed-in user's browser and read the replies. The token
 * lives in localStorage rather than a cookie, which narrows it, but the API
 * should still say who it trusts rather than trusting everyone.
 *
 * The allowlist comes from CORS_ORIGINS (comma-separated) or CLIENT_URL. When
 * neither is set the old reflecting behaviour is kept, so an existing
 * deployment does not stop working the moment it picks up this change — the
 * startup check warns about it instead. Requests with no Origin at all (curl,
 * server-to-server, same-origin navigation) are unaffected either way.
 */
export function corsOptions() {
  const configured = (process.env.CORS_ORIGINS || process.env.CLIENT_URL || '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);

  if (configured.length === 0) return { origin: true, credentials: true };

  const allowed = new Set(configured);

  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowed.has(origin.replace(/\/$/, ''))) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
  };
}

const app = express();

// The client is served from a different origin, so images fetched via <img src>
// need a cross-origin resource policy or the browser refuses to render them.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors(corsOptions()));

app.use(apiLimiter);
// Opened before the routes so audit hooks can see who is making each change.
app.use(requestContext);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  const database = req.app.locals.database || { status: 'starting' };
  res.json({ status: 'ok', database });
});

app.use('/api', (req, res, next) => {
  if (req.app.locals.database?.status === 'unavailable') {
    return res.status(503).json({
      message: 'Database is unavailable',
      detail: req.app.locals.database.message
    });
  }

  return next();
});

app.use('/media', (req, res, next) => {
  if (req.app.locals.database?.status === 'unavailable') {
    return res.status(503).json({ message: 'Database is unavailable' });
  }
  return next();
});
app.use('/media', mediaRoutes);

app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

export default app;

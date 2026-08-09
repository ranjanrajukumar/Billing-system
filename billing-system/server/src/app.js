import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import routes from './routes/index.js';
import mediaRoutes from './routes/media.routes.js';
import { errorHandler, notFound } from './middleware/errorMiddleware.js';
import { apiLimiter } from './middleware/rateLimiters.js';
import { requestContext } from './middleware/requestContext.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// The client is served from a different origin, so images fetched via <img src>
// need a cross-origin resource policy or the browser refuses to render them.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: true, credentials: true }));

app.use(apiLimiter);
// Opened before the routes so audit hooks can see who is making each change.
app.use(requestContext);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/pdf', express.static(path.join(__dirname, '..', 'pdf')));

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

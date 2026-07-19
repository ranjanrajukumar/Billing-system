import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import routes from './routes/index.js';
import { errorHandler, notFound } from './middleware/errorMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_MAX || 200)
}));
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

app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

export default app;

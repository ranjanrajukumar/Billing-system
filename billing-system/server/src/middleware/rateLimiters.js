import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

// Limits are read at module load, so make sure .env is applied first.
dotenv.config();

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);

// A JSON body so the client can surface the real reason instead of a generic error.
const message = { message: 'Too many requests, please try again later.' };

// A single page load fires several requests, so the general budget is generous.
export const apiLimiter = rateLimit({
  windowMs,
  max: Number(process.env.RATE_LIMIT_MAX || 2000),
  message
});

// Credential endpoints get a tight budget of their own to slow down brute force.
// Successful logins are not counted, so ordinary use never trips it.
export const authLimiter = rateLimit({
  windowMs,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
  skipSuccessfulRequests: true,
  message
});

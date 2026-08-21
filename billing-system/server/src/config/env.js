import dotenv from 'dotenv';

dotenv.config();

/**
 * What the process needs before it is safe to accept a request.
 *
 * The checks are deliberately split by environment. A developer running the app
 * for the first time should not be stopped by a missing SMTP host, but a
 * production process signing session tokens with an absent JWT_SECRET is a
 * different matter: jsonwebtoken throws on every verify, every call answers
 * 401, and the failure looks like "login is broken" rather than "nobody
 * configured the secret". Failing at boot puts the cause in the first line of
 * the log instead of the tenth support call.
 */

const MIN_SECRET_LENGTH = 32;

// Values shipped in the example env files. Present in a real deployment they
// mean someone copied the template and never replaced it.
const PLACEHOLDER_SECRETS = new Set([
  'changeme',
  'secret',
  'your-secret-key',
  'supersecret',
  'jwt-secret',
]);

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Collects every problem before reporting, so a misconfigured deployment is
 * fixed in one pass rather than one restart per missing variable.
 */
export function checkEnvironment() {
  const errors = [];
  const warnings = [];

  const secret = process.env.JWT_SECRET || '';
  if (!secret) {
    errors.push('JWT_SECRET is not set. Session tokens cannot be signed or verified.');
  } else if (PLACEHOLDER_SECRETS.has(secret.toLowerCase())) {
    errors.push('JWT_SECRET is still a placeholder value. Anyone with the template can mint a valid token.');
  } else if (secret.length < MIN_SECRET_LENGTH) {
    const complaint = `JWT_SECRET is ${secret.length} characters; ${MIN_SECRET_LENGTH} or more is expected.`;
    // Short secrets are brute-forceable, but breaking an existing development
    // database over it helps nobody.
    (isProduction() ? errors : warnings).push(complaint);
  }

  if (isProduction()) {
    if (!process.env.CORS_ORIGINS && !process.env.CLIENT_URL) {
      warnings.push(
        'Neither CORS_ORIGINS nor CLIENT_URL is set, so the API will accept browser calls '
        + 'from any origin. Set CORS_ORIGINS to the sites that should be allowed.',
      );
    }

    if (process.env.START_WITHOUT_DB !== 'false') {
      warnings.push(
        'START_WITHOUT_DB is not "false", so the API will start and serve 503s if the '
        + 'database is unreachable instead of failing loudly.',
      );
    }

    if (!process.env.ADMIN_PASSWORD) {
      warnings.push(
        'ADMIN_PASSWORD is not set. A first-time seed creates the System Admin account '
        + 'with the documented default password — set it, or change that password '
        + 'immediately after the first sign-in.',
      );
    }

    if (process.env.ALLOW_PUBLIC_REGISTRATION === 'true') {
      warnings.push(
        'ALLOW_PUBLIC_REGISTRATION is true: anyone who can reach this API can create '
        + 'an account and read the data its role allows.',
      );
    }

    if (process.env.DB_SYNC_ALTER === 'true') {
      warnings.push(
        'DB_SYNC_ALTER is true: the process will ALTER live tables to match the models on '
        + 'every boot. Prefer reviewed migrations against production data.',
      );
    }
  }

  const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
  if (!Number.isFinite(rounds) || rounds < 10) {
    warnings.push(`BCRYPT_ROUNDS is ${process.env.BCRYPT_ROUNDS}; 10 or more is expected for password hashing.`);
  }

  return { errors, warnings };
}

/**
 * Prints what is wrong and, in production, refuses to continue. Development
 * keeps running so the app stays usable while it is being set up.
 */
export function assertEnvironment() {
  const { errors, warnings } = checkEnvironment();

  for (const warning of warnings) console.warn(`Configuration warning: ${warning}`);

  if (errors.length === 0) return;

  for (const error of errors) console.error(`Configuration error: ${error}`);

  if (isProduction()) {
    console.error('Refusing to start with an unsafe configuration.');
    process.exit(1);
  }

  console.warn('Continuing anyway because NODE_ENV is not "production".');
}

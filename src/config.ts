import 'dotenv/config';

const nodeEnv = process.env.NODE_ENV ?? 'development';
if (!['development', 'test', 'production'].includes(nodeEnv)) {
  throw new Error('NODE_ENV must be development, test, or production');
}

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const sessionSecret = process.env.SESSION_SECRET ?? '';
if (Buffer.byteLength(sessionSecret) < 32) {
  throw new Error('SESSION_SECRET must contain at least 32 bytes; generate one with: openssl rand -hex 32');
}

const configuredWebOrigin = process.env.WEB_ORIGIN?.trim();
let webOrigin: string | undefined;
if (configuredWebOrigin) {
  try {
    const url = new URL(configuredWebOrigin);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    webOrigin = url.origin;
  } catch {
    throw new Error('WEB_ORIGIN must be a valid http(s) origin');
  }
}

export const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  docsEnabled: nodeEnv !== 'production',
  port,
  databaseUrl,
  sessionSecret,
  sessionCookieName: nodeEnv === 'production' ? '__Host-session' : 'node_api_probe_session',
  webOrigin,
};

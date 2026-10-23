import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import csrfProtection from '@fastify/csrf-protection';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import session from '@fastify/session';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import connectPgSimple from 'connect-pg-simple';
import expressSession from 'express-session';
import type { Pool } from 'pg';
import { config } from './config.js';
import { apiError } from './errors.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerHealthRoute } from './routes/health.js';
import { registerItemRoutes } from './routes/items.js';

const PgSessionStore = connectPgSimple(expressSession);

export async function createApp(pool: Pool) {
  const app = Fastify({
    logger: {
      level: 'info',
      redact: [
        'req.headers.cookie',
        'req.headers.authorization',
        'req.body.password',
        'res.headers["set-cookie"]',
      ],
    },
    trustProxy: process.env.TRUST_PROXY === 'true',
  });

  app.decorate('sessionCookieName', config.sessionCookieName);
  app.decorate('isProduction', config.isProduction);
  app.decorateRequest('userId', null);
  app.decorate('authenticate', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const userId = request.session.get('userId');
    if (!userId) {
      return reply.code(401).send(apiError('UNAUTHENTICATED', 'Sign in to continue'));
    }
    request.userId = userId;
  });

  await app.register(cookie);
  if (config.webOrigin) {
    await app.register(cors, {
      origin: config.webOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['content-type', 'x-csrf-token'],
    });
  }

  const sessionStore = new PgSessionStore({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: true,
    ttl: 7 * 24 * 60 * 60,
    pruneSessionInterval: 15 * 60,
    errorLog: (error) => app.log.error({ err: error }, 'Session store error'),
  });

  await app.register(session, {
    secret: config.sessionSecret,
    cookieName: config.sessionCookieName,
    store: sessionStore as unknown as session.SessionStore,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      path: '/',
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  });

  await app.register(csrfProtection, {
    sessionPlugin: '@fastify/session',
    getToken: (request) => {
      const token = request.headers['x-csrf-token'];
      return Array.isArray(token) ? token[0] : token;
    },
  });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: { title: 'Node API Probe', version: '1.0.0' },
      servers: [{ url: '/' }],
      components: {
        securitySchemes: {
          sessionCookie: {
            type: 'apiKey',
            in: 'cookie',
            name: config.sessionCookieName,
          },
        },
      },
    },
  });

  await app.register(helmet, (instance) => ({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'", ...instance.swaggerCSP.script],
        styleSrc: ["'self'", ...instance.swaggerCSP.style],
      },
    },
  }));

  if (config.docsEnabled) {
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list', deepLinking: false },
    });
  }

  app.setErrorHandler((error, request, reply) => {
    const requestError = error as Error & { statusCode?: number; validation?: unknown };
    if (requestError.validation) {
      return reply.code(400).send(apiError('VALIDATION_ERROR', 'Request validation failed'));
    }

    const statusCode = requestError.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error({ err: requestError }, 'Unhandled request error');
      return reply.code(500).send(apiError('INTERNAL_ERROR', 'An unexpected error occurred'));
    }
    if (statusCode === 403) {
      return reply.code(403).send(apiError('CSRF_INVALID', 'Request could not be verified'));
    }
    if (statusCode === 429) {
      return reply.code(429).send(apiError('RATE_LIMITED', 'Too many requests'));
    }
    return reply.code(statusCode).send(apiError('REQUEST_ERROR', 'Request could not be completed'));
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send(apiError('NOT_FOUND', 'Route not found'));
  });

  await registerHealthRoute(app);
  await registerAuthRoutes(app, pool);
  await registerItemRoutes(app, pool);

  app.addHook('onClose', async () => {
    sessionStore.close();
    await pool.end();
  });

  return app;
}

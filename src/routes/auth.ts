import argon2 from 'argon2';
import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { apiError, errorResponseSchema, type ApiError } from '../errors.js';

type UserRow = { id: string; email: string };
type CredentialBody = { email: string; password: string };
type AuthResponse = { user: UserRow; csrfToken: string };

const dummyPasswordHash = argon2.hash(randomBytes(32).toString('hex'), { type: argon2.argon2id });

const userSchema = {
  type: 'object',
  required: ['id', 'email'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email' },
  },
} as const;

const authResponseSchema = {
  type: 'object',
  required: ['user', 'csrfToken'],
  properties: {
    user: userSchema,
    csrfToken: { type: 'string' },
  },
} as const;

const credentialsBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', format: 'email', maxLength: 254 },
    password: { type: 'string', minLength: 15, maxLength: 128 },
  },
} as const;

export async function registerAuthRoutes(app: FastifyInstance, pool: Pool): Promise<void> {
  app.get('/api/v1/auth/csrf', {
    schema: {
      tags: ['auth'],
      summary: 'Get a CSRF token for browser requests',
      response: {
        200: {
          type: 'object',
          required: ['csrfToken'],
          properties: { csrfToken: { type: 'string' } },
        },
      },
    },
  }, async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { csrfToken: reply.generateCsrf() };
  });

  app.post<{ Body: CredentialBody; Reply: AuthResponse | ApiError }>('/api/v1/auth/register', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    onRequest: app.csrfProtection,
    schema: {
      tags: ['auth'],
      summary: 'Register a user and start a session',
      body: credentialsBodySchema,
      response: {
        201: authResponseSchema,
        400: errorResponseSchema,
        403: errorResponseSchema,
        409: errorResponseSchema,
        429: errorResponseSchema,
      },
    },
  }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const email = request.body.email.trim().toLowerCase();
    const passwordHash = await argon2.hash(request.body.password, { type: argon2.argon2id });
    const id = randomUUID();

    try {
      await pool.query(
        'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)',
        [id, email, passwordHash],
      );
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        return reply.code(409).send(apiError('EMAIL_IN_USE', 'An account with this email already exists'));
      }
      throw error;
    }

    await request.session.regenerate();
    request.session.set('userId', id);
    await request.session.save();
    return reply.code(201).send({ user: { id, email }, csrfToken: reply.generateCsrf() });
  });

  app.post<{ Body: CredentialBody; Reply: AuthResponse | ApiError }>('/api/v1/auth/login', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    onRequest: app.csrfProtection,
    schema: {
      tags: ['auth'],
      summary: 'Verify credentials and start a session',
      body: credentialsBodySchema,
      response: {
        200: authResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        429: errorResponseSchema,
      },
    },
  }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const email = request.body.email.trim().toLowerCase();
    const result = await pool.query<UserRow & { password_hash: string }>(
      'SELECT id, email, password_hash FROM users WHERE LOWER(email) = $1',
      [email],
    );
    const user = result.rows[0];
    const hash = user?.password_hash ?? await dummyPasswordHash;
    const validPassword = await argon2.verify(hash, request.body.password);

    if (!user || !validPassword) {
      return reply.code(401).send(apiError('INVALID_CREDENTIALS', 'Email or password is incorrect'));
    }

    await request.session.regenerate();
    request.session.set('userId', user.id);
    await request.session.save();
    return { user: { id: user.id, email: user.email }, csrfToken: reply.generateCsrf() };
  });

  app.post('/api/v1/auth/logout', {
    onRequest: [app.authenticate, app.csrfProtection],
    schema: {
      tags: ['auth'],
      summary: 'End the current session',
      security: [{ sessionCookie: [] }],
      response: { 204: { type: 'null' }, 401: errorResponseSchema, 403: errorResponseSchema },
    },
  }, async (request, reply) => {
    await request.session.destroy();
    reply.clearCookie(app.sessionCookieName, {
      path: '/',
      httpOnly: true,
      secure: app.isProduction,
      sameSite: 'lax',
    });
    return reply.code(204).send();
  });

  app.get('/api/v1/me', {
    onRequest: app.authenticate,
    schema: {
      tags: ['auth'],
      summary: 'Get the current user',
      security: [{ sessionCookie: [] }],
      response: { 200: userSchema, 401: errorResponseSchema },
    },
  }, async (request, reply) => {
    const result = await pool.query<UserRow>(
      'SELECT id, email FROM users WHERE id = $1',
      [request.userId],
    );
    const user = result.rows[0];
    if (!user) {
      await request.session.destroy();
      return reply.code(401).send(apiError('UNAUTHENTICATED', 'Sign in to continue'));
    }

    reply.header('Cache-Control', 'no-store');
    return user;
  });
}

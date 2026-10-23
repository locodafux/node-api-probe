import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { apiError, errorResponseSchema, type ApiError } from '../errors.js';

type Item = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};
type CreateItemBody = { name: string; description?: string | null };
type UpdateItemBody = { name?: string; description?: string | null };
type ItemRow = Omit<Item, 'createdAt' | 'updatedAt'> & { createdAt: Date; updatedAt: Date };
type ItemParams = { id: string };

const itemSchema = {
  type: 'object',
  required: ['id', 'name', 'description', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    description: { type: ['string', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const;

const createItemSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
    description: { type: ['string', 'null'], maxLength: 2000 },
  },
} as const;

const updateItemSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
    description: { type: ['string', 'null'], maxLength: 2000 },
  },
} as const;

const itemParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
} as const;

const itemResponseSchema = {
  type: 'object',
  required: ['item'],
  properties: { item: itemSchema },
} as const;

function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function registerItemRoutes(app: FastifyInstance, pool: Pool): Promise<void> {
  app.get<{ Reply: { items: Item[] } | ApiError }>('/api/v1/items', {
    onRequest: app.authenticate,
    schema: {
      tags: ['items'],
      summary: 'List the current user’s items',
      security: [{ sessionCookie: [] }],
      response: {
        200: { type: 'object', required: ['items'], properties: { items: { type: 'array', items: itemSchema } } },
        401: errorResponseSchema,
      },
    },
  }, async (request) => {
    const result = await pool.query<ItemRow>(
      `SELECT id, name, description, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM items WHERE user_id = $1 ORDER BY created_at DESC`,
      [request.userId],
    );
    return { items: result.rows.map(toItem) };
  });

  app.post<{ Body: CreateItemBody; Reply: { item: Item } | ApiError }>('/api/v1/items', {
    onRequest: [app.authenticate, app.csrfProtection],
    schema: {
      tags: ['items'],
      summary: 'Create an item for the current user',
      security: [{ sessionCookie: [] }],
      body: createItemSchema,
      response: { 201: itemResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema },
    },
  }, async (request, reply) => {
    const id = randomUUID();
    const result = await pool.query<ItemRow>(
      `INSERT INTO items (id, user_id, name, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [id, request.userId, request.body.name.trim(), request.body.description ?? null],
    );
    return reply.code(201).send({ item: toItem(result.rows[0]!) });
  });

  app.get<{ Params: ItemParams; Reply: { item: Item } | ApiError }>('/api/v1/items/:id', {
    onRequest: app.authenticate,
    schema: {
      tags: ['items'],
      summary: 'Get one of the current user’s items',
      security: [{ sessionCookie: [] }],
      params: itemParamsSchema,
      response: { 200: itemResponseSchema, 401: errorResponseSchema, 404: errorResponseSchema },
    },
  }, async (request, reply) => {
    const result = await pool.query<ItemRow>(
      `SELECT id, name, description, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM items WHERE id = $1 AND user_id = $2`,
      [request.params.id, request.userId],
    );
    const row = result.rows[0];
    if (!row) return reply.code(404).send(apiError('ITEM_NOT_FOUND', 'Item not found'));
    return { item: toItem(row) };
  });

  app.patch<{ Params: ItemParams; Body: UpdateItemBody; Reply: { item: Item } | ApiError }>('/api/v1/items/:id', {
    onRequest: [app.authenticate, app.csrfProtection],
    schema: {
      tags: ['items'],
      summary: 'Update one of the current user’s items',
      security: [{ sessionCookie: [] }],
      params: itemParamsSchema,
      body: updateItemSchema,
      response: { 200: itemResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema },
    },
  }, async (request, reply) => {
    const body = request.body;
    const hasName = Object.hasOwn(body, 'name');
    const hasDescription = Object.hasOwn(body, 'description');
    const result = await pool.query<ItemRow>(
      `UPDATE items
       SET name = CASE WHEN $3 THEN $4 ELSE name END,
           description = CASE WHEN $5 THEN $6 ELSE description END,
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, name, description, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [request.params.id, request.userId, hasName, body.name?.trim() ?? null, hasDescription, body.description ?? null],
    );
    const row = result.rows[0];
    if (!row) return reply.code(404).send(apiError('ITEM_NOT_FOUND', 'Item not found'));
    return { item: toItem(row) };
  });

  app.delete<{ Params: ItemParams; Reply: ApiError | undefined }>('/api/v1/items/:id', {
    onRequest: [app.authenticate, app.csrfProtection],
    schema: {
      tags: ['items'],
      summary: 'Delete one of the current user’s items',
      security: [{ sessionCookie: [] }],
      params: itemParamsSchema,
      response: { 204: { type: 'null' }, 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema },
    },
  }, async (request, reply) => {
    const result = await pool.query(
      'DELETE FROM items WHERE id = $1 AND user_id = $2',
      [request.params.id, request.userId],
    );
    if (result.rowCount === 0) return reply.code(404).send(apiError('ITEM_NOT_FOUND', 'Item not found'));
    return reply.code(204).send(undefined);
  });
}

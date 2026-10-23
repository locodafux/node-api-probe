import type { FastifyInstance } from 'fastify';

export async function registerHealthRoute(app: FastifyInstance): Promise<void> {
  app.get('/health', {
    schema: {
      tags: ['system'],
      summary: 'Check API availability',
      response: {
        200: {
          type: 'object',
          required: ['status'],
          properties: { status: { type: 'string', const: 'ok' } },
        },
      },
    },
  }, async () => ({ status: 'ok' as const }));
}

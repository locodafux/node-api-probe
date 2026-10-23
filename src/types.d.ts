import 'fastify';

declare module 'fastify' {
  interface Session {
    userId?: string;
  }

  interface FastifyRequest {
    userId: string | null;
  }

  interface FastifyInstance {
    sessionCookieName: string;
    isProduction: boolean;
    authenticate: import('fastify').preHandlerHookHandler;
  }
}

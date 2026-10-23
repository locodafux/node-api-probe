import { Pool } from 'pg';
import { createApp } from './app.js';
import { config } from './config.js';

const pool = new Pool({ connectionString: config.databaseUrl });
const app = await createApp(pool);

try {
  await pool.query('SELECT 1');
  await app.listen({ port: config.port, host: '0.0.0.0' });
} catch (error) {
  app.log.error({ err: error }, 'Failed to start API');
  await app.close().catch(() => undefined);
  process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().catch((error) => {
      app.log.error({ err: error }, 'Failed to shut down cleanly');
      process.exitCode = 1;
    });
  });
}

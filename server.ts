import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import { attachSession, resolveUploadsDir } from './server/middleware.ts';
import { createApiRouter } from './server/routes.ts';

const PORT = Number(process.env.PORT ?? 3000);

async function startServer() {
  const app = express();

  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  const uploadsDir = resolveUploadsDir();
  app.use('/uploads', express.static(uploadsDir));

  app.use(attachSession);
  app.use('/api', createApiRouter());

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`UrbanPulse AI server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start UrbanPulse AI server:', err);
  process.exit(1);
});

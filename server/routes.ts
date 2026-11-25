import { Router } from 'express';
import { createAuthAndReportsRouter } from './authAndReportsRoutes.ts';
import { createIssuesAndAdminRouter } from './issuesAndAdminRoutes.ts';

export function createApiRouter(): Router {
  const router = Router();
  router.use(createAuthAndReportsRouter());
  router.use(createIssuesAndAdminRouter());
  return router;
}

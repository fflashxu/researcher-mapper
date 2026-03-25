import { Router, Request, Response, NextFunction } from 'express';
import * as svc from './projects.service';

export const projectsRouter = Router();

projectsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try { res.json(await svc.listProjects()); } catch (e) { next(e); }
});

projectsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try { res.status(201).json(await svc.createProject(req.body)); } catch (e) { next(e); }
});

projectsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await svc.getProject(req.params.id)); } catch (e) { next(e); }
});

projectsRouter.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await svc.updateProject(req.params.id, req.body)); } catch (e) { next(e); }
});

projectsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try { await svc.deleteProject(req.params.id); res.json({ ok: true }); } catch (e) { next(e); }
});

// PATCH /api/projects/pools/:jobId  { poolName }
projectsRouter.patch('/pools/:jobId', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await svc.updatePoolName(req.params.jobId, req.body.poolName)); } catch (e) { next(e); }
});

// GET /api/projects/pools/:jobId/researchers
projectsRouter.get('/pools/:jobId/researchers', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await svc.getPoolResearchers(req.params.jobId)); } catch (e) { next(e); }
});

// POST /api/projects/pools/:jobId/researchers  { researcherIds: string[] }
projectsRouter.post('/pools/:jobId/researchers', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await svc.addResearchersToPool(req.params.jobId, req.body.researcherIds)); } catch (e) { next(e); }
});

import { Router, Request, Response, NextFunction } from 'express';
import { ValidationError } from '../../shared/errors';
import * as svc from './extract.service';

export const extractRouter = Router();

// POST /api/extract  { paperUrl, projectId? }  → starts async job, returns { jobId }
extractRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { paperUrl, projectId } = req.body;
    if (!paperUrl) throw new ValidationError('paperUrl is required');
    const result = await svc.extractFromUrl(paperUrl, projectId);
    res.status(202).json(result);
  } catch (e) { next(e); }
});

// GET /api/extract/jobs  → list recent jobs
extractRouter.get('/jobs', async (_req: Request, res: Response, next: NextFunction) => {
  try { res.json(await svc.listJobs()); } catch (e) { next(e); }
});

// GET /api/extract/jobs/:id  → poll job status
extractRouter.get('/jobs/:id', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await svc.getJobStatus(req.params.id)); } catch (e) { next(e); }
});

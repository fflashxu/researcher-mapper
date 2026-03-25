import { Router, Request, Response, NextFunction } from 'express';
import { ValidationError } from '../../shared/errors';
import * as svc from './export.service';

export const exportRouter = Router();

// POST /api/export/csv  { researcherIds? }  → CSV file download
exportRouter.post('/csv', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { researcherIds } = req.body;
    const csv = await svc.exportCsv(researcherIds);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="researchers.csv"');
    res.send(csv);
  } catch (e) { next(e); }
});

// POST /api/export/push  { researcherIds, icebreakerUrl, icebreakerApiKey, campaignId }
exportRouter.post('/push', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { researcherIds, icebreakerUrl, icebreakerApiKey, campaignId } = req.body;
    if (!researcherIds?.length) throw new ValidationError('researcherIds is required');
    if (!campaignId) throw new ValidationError('campaignId is required');
    const result = await svc.pushToIcebreaker({ researcherIds, icebreakerUrl, icebreakerApiKey, campaignId });
    res.json(result);
  } catch (e) { next(e); }
});

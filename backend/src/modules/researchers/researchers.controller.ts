import { Router, Request, Response, NextFunction } from 'express';
import * as svc from './researchers.service';
import { prisma } from '../../lib/prisma';

export const researchersRouter = Router();

researchersRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { company, researchArea, status, priority, page, limit, q } = req.query as any;
    res.json(await svc.listResearchers({ company, researchArea, status, priority, q,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    }));
  } catch (e) { next(e); }
});

researchersRouter.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try { res.json(await svc.getStats()); } catch (e) { next(e); }
});

researchersRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await svc.getResearcher(req.params.id)); } catch (e) { next(e); }
});

researchersRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try { res.status(201).json(await svc.createResearcher(req.body)); } catch (e) { next(e); }
});

researchersRouter.post('/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try { res.status(201).json(await svc.bulkCreate(req.body.researchers)); } catch (e) { next(e); }
});

researchersRouter.post('/re-enrich', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = req.body as { ids?: string[] };
    const researchers = ids?.length
      ? await prisma.researcher.findMany({ where: { id: { in: ids } } })
      : await prisma.researcher.findMany();
    res.json({ started: true, count: researchers.length });

    // Fire-and-forget: enrich each researcher and save back to DB
    (async () => {
      const { enrichResearcher } = await import('../extract/extract.service');
      for (let i = 0; i < researchers.length; i++) {
        const r = { ...researchers[i] } as any;
        // Parse JSON strings back to arrays for enrichResearcher compatibility
        try { r.researchAreas = JSON.parse(r.researchAreas || '[]'); } catch { r.researchAreas = []; }
        try { r.previousCompanies = JSON.parse(r.previousCompanies || '[]'); } catch { r.previousCompanies = []; }
        await enrichResearcher(r, i);
        // Save updated profile links back to DB
        await prisma.researcher.update({
          where: { id: researchers[i].id },
          data: {
            email: r.email || researchers[i].email,
            homepage: r.homepage || researchers[i].homepage,
            googleScholar: r.googleScholar || researchers[i].googleScholar,
            github: r.github || researchers[i].github,
            linkedin: r.linkedin || researchers[i].linkedin,
          },
        });
        console.log(`[re-enrich] saved ${r.firstName} ${r.lastName}`);
      }
      console.log(`[re-enrich] done for ${researchers.length} researchers`);
    })().catch(console.error);
  } catch (e) { next(e); }
});

researchersRouter.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await svc.updateResearcher(req.params.id, req.body)); } catch (e) { next(e); }
});

researchersRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try { await svc.deleteResearcher(req.params.id); res.json({ ok: true }); } catch (e) { next(e); }
});

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import OpenAI from 'openai';

export const settingsRouter = Router();

async function getSettings() {
  return prisma.settings.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} }) as any;
}

settingsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const s = await getSettings();
    res.json({ hasDashscopeKey: !!s.dashscopeKey, hasSerperKey: !!s.serperKey });
  } catch (e) { next(e); }
});

settingsRouter.put('/dashscope', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dashscopeKey } = req.body;
    await prisma.settings.upsert({
      where: { id: 'default' },
      create: { id: 'default', dashscopeKey },
      update: { dashscopeKey },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

settingsRouter.post('/test-dashscope', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const s = await getSettings();
    const key = s.dashscopeKey || process.env.DASHSCOPE_API_KEY;
    if (!key) return res.status(422).json({ error: 'No API key configured' });
    const client = new OpenAI({ apiKey: key, baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' });
    await client.chat.completions.create({
      model: 'qwen-plus',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 5,
    });
    res.json({ ok: true });
  } catch (e: any) { next(e); }
});

settingsRouter.put('/serper', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serperKey } = req.body;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.settings as any).upsert({
      where: { id: 'default' },
      create: { id: 'default', serperKey },
      update: { serperKey },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export async function getDashscopeKey(): Promise<string> {
  const s = await prisma.settings.findUnique({ where: { id: 'default' } });
  return s?.dashscopeKey || process.env.DASHSCOPE_API_KEY || '';
}

export async function getSerperKey(): Promise<string> {
  const s = await prisma.settings.findUnique({ where: { id: 'default' } }) as any;
  return s?.serperKey || process.env.SERPER_API_KEY || '';
}

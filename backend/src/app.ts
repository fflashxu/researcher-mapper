import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { researchersRouter } from './modules/researchers/researchers.controller';
import { extractRouter } from './modules/extract/extract.controller';
import { exportRouter } from './modules/export/export.controller';
import { settingsRouter } from './modules/settings/settings.controller';
import { projectsRouter } from './modules/projects/projects.controller';

const app = express();
app.use(cors({ origin: env.FRONTEND_URL }));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));
app.use('/api/researchers', researchersRouter);
app.use('/api/extract', extractRouter);
app.use('/api/export', exportRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/projects', projectsRouter);
app.use(errorHandler);

export default app;

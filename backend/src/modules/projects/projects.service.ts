import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../shared/errors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function listProjects() {
  const projects = await db.project.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      jobs: {
        select: { id: true, status: true, researchersFound: true, paperUrl: true, paperTitle: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  return projects.map(p => ({
    ...p,
    poolCount: p.jobs.length,
    totalResearchers: p.jobs.reduce((sum, j) => sum + j.researchersFound, 0),
  }));
}

export async function getProject(id: string) {
  const project = await db.project.findUnique({
    where: { id },
    include: {
      jobs: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!project) throw new NotFoundError();
  return project;
}

export async function createProject(data: { name: string; description?: string }) {
  return db.project.create({ data });
}

export async function updateProject(id: string, data: { name?: string; description?: string }) {
  const exists = await db.project.findUnique({ where: { id } });
  if (!exists) throw new NotFoundError();
  return db.project.update({ where: { id }, data });
}

export async function deleteProject(id: string) {
  const exists = await db.project.findUnique({ where: { id } });
  if (!exists) throw new NotFoundError();
  await db.project.delete({ where: { id } });
}

// Update pool name
export async function updatePoolName(jobId: string, poolName: string) {
  const exists = await (prisma as any).extractionJob.findUnique({ where: { id: jobId } });
  if (!exists) throw new NotFoundError();
  return (prisma as any).extractionJob.update({ where: { id: jobId }, data: { poolName } });
}

// Get researchers for a specific pool (filtered by sourceUrl = job.paperUrl)
export async function getPoolResearchers(jobId: string) {
  const job = await prisma.extractionJob.findUnique({ where: { id: jobId } });
  if (!job) throw new NotFoundError();
  const researchers = await prisma.researcher.findMany({
    where: { sourceUrl: job.paperUrl },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  return { job, researchers };
}

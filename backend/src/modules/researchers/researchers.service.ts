import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../shared/errors';
import crypto from 'crypto';

function makeDedupeKey(email?: string | null, firstName?: string | null, lastName?: string | null, company?: string | null) {
  if (email) return email.toLowerCase().trim();
  const raw = `${firstName}${lastName}${company}`.toLowerCase().replace(/\s/g, '');
  return 'hash:' + crypto.createHash('md5').update(raw).digest('hex').slice(0, 12);
}

export async function listResearchers(filters: {
  company?: string; researchArea?: string; status?: string; priority?: string;
  page?: number; limit?: number; q?: string;
}) {
  const { company, researchArea, status, priority, page = 1, limit = 50, q } = filters;
  const where: any = {};
  if (company) where.currentOrg = { contains: company };
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (researchArea) where.researchAreas = { contains: researchArea };
  if (q) where.OR = [
    { firstName: { contains: q } },
    { lastName: { contains: q } },
    { nameCN: { contains: q } },
    { currentOrg: { contains: q } },
    { email: { contains: q } },
  ];

  const [total, researchers] = await Promise.all([
    prisma.researcher.count({ where }),
    prisma.researcher.findMany({
      where,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return { researchers, total, page, limit };
}

export async function getResearcher(id: string) {
  const r = await prisma.researcher.findUnique({ where: { id }, include: { papers: { include: { paper: true } } } });
  if (!r) throw new NotFoundError();
  return r;
}

export async function createResearcher(data: any) {
  const dedupeKey = makeDedupeKey(data.email, data.firstName, data.lastName, data.currentOrg);
  // Upsert: 新建时写入 sourceUrl，更新时不覆盖（保留第一次出现的来源 paper）
  const { sourceUrl, ...updateData } = data;
  return prisma.researcher.upsert({
    where: { dedupeKey },
    create: { ...data, dedupeKey },
    update: updateData,
  });
}

export async function updateResearcher(id: string, data: any) {
  const exists = await prisma.researcher.findUnique({ where: { id } });
  if (!exists) throw new NotFoundError();
  return prisma.researcher.update({ where: { id }, data });
}

export async function deleteResearcher(id: string) {
  const exists = await prisma.researcher.findUnique({ where: { id } });
  if (!exists) throw new NotFoundError();
  await prisma.researcher.delete({ where: { id } });
}

export async function bulkCreate(researchers: any[]): Promise<{ created: number; updated: number; errors: string[]; savedIds: string[] }> {
  const results = { created: 0, updated: 0, errors: [] as string[], savedIds: [] as string[] };
  for (const r of researchers) {
    try {
      const dedupeKey = makeDedupeKey(r.email, r.firstName, r.lastName, r.currentOrg);
      const { sourceUrl, ...updateData } = r;
      const existing = await prisma.researcher.findUnique({ where: { dedupeKey } });
      let saved: any;
      if (existing) {
        saved = await prisma.researcher.update({ where: { dedupeKey }, data: updateData });
        results.updated++;
      } else {
        saved = await prisma.researcher.create({ data: { ...r, dedupeKey } });
        results.created++;
      }
      results.savedIds.push(saved.id);
    } catch (e: any) {
      results.errors.push(`${r.firstName} ${r.lastName}: ${e.message}`);
    }
  }
  return results;
}

export async function getStats() {
  const [total, byStatus, byPriority] = await Promise.all([
    prisma.researcher.count(),
    prisma.researcher.groupBy({ by: ['status'], _count: true }),
    prisma.researcher.groupBy({ by: ['priority'], _count: true }),
  ]);
  // Top companies
  const all = await prisma.researcher.findMany({ select: { currentOrg: true } });
  const companyCounts: Record<string, number> = {};
  for (const r of all) {
    if (r.currentOrg) companyCounts[r.currentOrg] = (companyCounts[r.currentOrg] || 0) + 1;
  }
  const topCompanies = Object.entries(companyCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([company, count]) => ({ company, count }));
  return { total, byStatus, byPriority, topCompanies };
}

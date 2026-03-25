import axios from 'axios';
import { prisma } from '../../lib/prisma';
import { ValidationError } from '../../shared/errors';

// Build rawText background summary for Icebreaker candidates
function buildRawText(r: any): string {
  const areas = safeJson(r.researchAreas);
  const prev = safeJson(r.previousCompanies);
  return [
    `Research Background:`,
    `- Company: ${r.currentOrg || '—'}`,
    `- Title: ${r.jobTitle || '—'}`,
    `- Team: ${r.team || '—'}`,
    `- Research Areas: ${areas.join(', ') || '—'}`,
    `- Seniority: ${r.seniority || '—'}`,
    ``,
    `Education: ${r.education || '—'}`,
    ``,
    `Previous Experience: ${prev.join(', ') || '—'}`,
    ``,
    `Online Presence:`,
    r.googleScholar ? `- Google Scholar: ${r.googleScholar}` : null,
    r.github ? `- GitHub: ${r.github}` : null,
    r.linkedin ? `- LinkedIn: ${r.linkedin}` : null,
    r.homepage ? `- Homepage: ${r.homepage}` : null,
    r.notes ? `\nNotes: ${r.notes}` : null,
  ].filter(Boolean).join('\n');
}

function safeJson(val: string | null | undefined): string[] {
  if (!val) return [];
  try { return JSON.parse(val); } catch { return []; }
}

// ── CSV export ────────────────────────────────────────────────────────────────

export async function exportCsv(researcherIds?: string[]): Promise<string> {
  const where = researcherIds?.length ? { id: { in: researcherIds } } : {};
  const researchers = await prisma.researcher.findMany({ where });

  const headers = ['name', 'email', 'currentOrg', 'jobTitle', 'seniority', 'researchAreas',
    'education', 'previousCompanies', 'googleScholar', 'github', 'linkedin', 'homepage',
    'status', 'priority', 'notes', 'background'];

  const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const rows = researchers.map(r => {
    const areas = safeJson(r.researchAreas).join('; ');
    const prev = safeJson(r.previousCompanies).join('; ');
    return [
      `${r.firstName || ''} ${r.lastName || ''}`.trim(),
      r.email, r.currentOrg, r.jobTitle, r.seniority,
      areas, r.education, prev,
      r.googleScholar, r.github, r.linkedin, r.homepage,
      r.status, r.priority, r.notes,
      buildRawText(r),
    ].map(escape).join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

// ── Push to Icebreaker ────────────────────────────────────────────────────────

export async function pushToIcebreaker(params: {
  researcherIds: string[];
  icebreakerUrl: string;
  icebreakerApiKey: string;
  campaignId: string;
}) {
  const { researcherIds, icebreakerUrl, icebreakerApiKey, campaignId } = params;
  if (!icebreakerUrl || !icebreakerApiKey) throw new ValidationError('Icebreaker URL and API key are required');

  const researchers = await prisma.researcher.findMany({ where: { id: { in: researcherIds } } });
  const candidates = researchers.map(r => ({
    name: `${r.firstName || ''} ${r.lastName || ''}`.trim() || undefined,
    email: r.email || undefined,
    rawText: buildRawText(r),
    source: 'researcher-mapper',
  }));

  const response = await axios.post(
    `${icebreakerUrl.replace(/\/$/, '')}/api/campaigns/${campaignId}/candidates`,
    { candidates },
    { headers: { Authorization: `Bearer ${icebreakerApiKey}`, 'Content-Type': 'application/json' }, timeout: 15000 }
  );
  return response.data;
}

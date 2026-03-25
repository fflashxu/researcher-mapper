/**
 * One-time script: backfill currentOrg for researchers where it's null.
 * Strategy: group researchers by sourceUrl → fetch arXiv HTML affiliations →
 * match name → update currentOrg.
 *
 * Run: npx ts-node scripts/backfill-orgs.ts
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fetchHtml(url: string): Promise<string> {
  const { data } = await axios.get(url, {
    timeout: 20000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ResearcherMapper/1.0)' },
    maxRedirects: 5,
    responseType: 'text',
  });
  return data as string;
}

/**
 * Returns Map<"firstname lastname" lowercased, orgName>.
 * Handles two formats:
 *   (a) Indexed: "John Smith1 Jane Doe2  1ByteDance 2Peking University"
 *   (b) Single-org: "John Smith, Jane Doe Alibaba Group"
 */
async function fetchAffiliationMap(arxivId: string): Promise<Map<string, string>> {
  try {
    const html = await fetchHtml(`https://arxiv.org/html/${arxivId}`);
    const $ = cheerio.load(html);
    $('annotation').remove();
    const raw = $('.ltx_authors').text().replace(/\s+/g, ' ').trim();
    if (!raw) return new Map();

    // ── (a) Indexed institution format ──────────────────────────────────────
    const instMap: Record<string, string> = {};
    const instRegex = /(\d+)([A-Z][A-Za-z &,.()\-]+?)(?=\s*\d+[A-Z]|$)/g;
    let m: RegExpExecArray | null;
    while ((m = instRegex.exec(raw)) !== null) {
      instMap[m[1]] = m[2].trim();
    }

    if (Object.keys(instMap).length > 0) {
      // Map each named author to their institution
      const result = new Map<string, string>();
      const authorRegex = /([A-Z][a-z]+(?: [A-Z][a-z]+)+)(\d+)/g;
      while ((m = authorRegex.exec(raw)) !== null) {
        const name = m[1].trim().toLowerCase();
        const inst = instMap[m[2]];
        if (inst) result.set(name, inst);
      }
      return result;
    }

    // ── (b) Single shared institution at end ─────────────────────────────────
    // Strip emails and special chars (∗†‡ superscripts)
    const cleaned = raw.replace(/\S+@\S+/g, '').replace(/[∗†‡]/g, '').replace(/\s+/g, ' ').trim();

    // Last comma-separated segment typically looks like "LastAuthor Institution Name"
    const segments = cleaned.split(',');
    const lastSeg = segments[segments.length - 1].trim();

    // Extract institution: everything after the leading "Firstname Lastname" pair
    const orgMatch = lastSeg.match(/^[A-Z][a-z]+ [A-Z][a-z]+\s+(.+)$/);
    const singleOrg = orgMatch?.[1]?.trim();

    if (!singleOrg || singleOrg.length < 3) return new Map();

    // Apply this org to every 2-word name in the full text (avoid greedy over-matching)
    const result = new Map<string, string>();
    const authorRegex2 = /([A-Z][a-z]+ [A-Z][a-z]+)/g;
    while ((m = authorRegex2.exec(cleaned)) !== null) {
      result.set(m[1].toLowerCase(), singleOrg);
    }
    return result;
  } catch (e: any) {
    console.error(`  [error] fetch failed for ${arxivId}: ${e.message}`);
    return new Map();
  }
}

async function main() {
  const researchers = await prisma.researcher.findMany({
    where: { currentOrg: null },
    select: { id: true, firstName: true, lastName: true, sourceUrl: true },
  });

  console.log(`Found ${researchers.length} researchers with currentOrg = null`);
  if (researchers.length === 0) { await prisma.$disconnect(); return; }

  // Group by sourceUrl
  const bySourceUrl = new Map<string, typeof researchers>();
  for (const r of researchers) {
    if (!r.sourceUrl) continue;
    const list = bySourceUrl.get(r.sourceUrl) ?? [];
    list.push(r);
    bySourceUrl.set(r.sourceUrl, list);
  }
  console.log(`Grouped into ${bySourceUrl.size} unique paper URL(s)\n`);

  let updated = 0;
  for (const [sourceUrl, group] of bySourceUrl) {
    const arxivIdMatch = sourceUrl.match(/arxiv\.org\/(?:abs|html)\/([0-9.v]+)/i);
    if (!arxivIdMatch) {
      console.log(`Skipping non-arXiv URL: ${sourceUrl}`);
      continue;
    }
    const arxivId = arxivIdMatch[1];
    console.log(`Paper ${arxivId} — ${group.length} researchers without org`);

    const affiliationMap = await fetchAffiliationMap(arxivId);
    console.log(`  Parsed ${affiliationMap.size} author-affiliation pairs`);

    for (const r of group) {
      const fullName = `${r.firstName} ${r.lastName}`.toLowerCase();
      const org = affiliationMap.get(fullName);
      if (org) {
        await prisma.researcher.update({ where: { id: r.id }, data: { currentOrg: org } });
        console.log(`  ✓  ${r.firstName} ${r.lastName} → ${org}`);
        updated++;
      } else {
        console.log(`  –  ${r.firstName} ${r.lastName}: no match`);
      }
    }

    await new Promise(res => setTimeout(res, 1200));
  }

  console.log(`\nDone. Updated ${updated} / ${researchers.length} researchers.`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

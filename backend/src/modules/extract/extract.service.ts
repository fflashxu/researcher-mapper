import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import { prisma } from '../../lib/prisma';
import { UnprocessableError } from '../../shared/errors';
import { getDashscopeKey, getSerperKey } from '../settings/settings.controller';

// ── Qwen client (OpenAI-compatible) ──────────────────────────────────────────

async function getClient() {
  const key = await getDashscopeKey();
  if (!key) throw new UnprocessableError('DashScope API Key 未配置，请在 Settings 中填写');
  return new OpenAI({ apiKey: key, baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' });
}

// ── URL normalization ─────────────────────────────────────────────────────────

function normalizeUrl(url: string): string {
  // arXiv: /pdf/XXXX → /abs/XXXX  (PDF is binary; abs page has structured HTML)
  // Also strip .pdf suffix if present
  return url
    .replace(/arxiv\.org\/pdf\//, 'arxiv.org/abs/')
    .replace(/\.pdf$/, '');
}

// ── Web fetching ─────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string> {
  const { data, headers } = await axios.get(url, {
    timeout: 20000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ResearcherMapper/1.0)' },
    maxRedirects: 5,
    responseType: 'text',
  });
  // Bail out early if we accidentally got a PDF
  const ct = headers['content-type'] || '';
  if (ct.includes('application/pdf')) throw new Error('URL returns a PDF file — use the abstract page URL (e.g. arxiv.org/abs/...)');
  return data;
}

async function fetchText(url: string): Promise<string> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  $('script, style, nav, footer, header, .nav, .footer, .header, .sidebar').remove();
  // 1. mailto: links (most reliable)
  const emails: string[] = [];
  $('a[href^="mailto:"]').each((_, el) => {
    const e = ($(el).attr('href') || '').replace('mailto:', '').split('?')[0].trim();
    if (e && e.includes('@') && e.includes('.')) emails.push(e);
  });
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  // 2. Plain text regex fallback
  if (!emails.length) {
    const plainMatches = bodyText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g);
    if (plainMatches) emails.push(...plainMatches.slice(0, 3));
  }
  return emails.length > 0 ? `[EMAILS_FOUND: ${emails.join(', ')}]\n${bodyText}` : bodyText;
}

// arXiv abs page: extract structured fields (title, authors, affiliations, abstract)
async function fetchArxivStructured(absUrl: string): Promise<string> {
  const html = await fetchHtml(absUrl);
  const $ = cheerio.load(html);

  const title = $('h1.title').text().replace('Title:', '').trim()
    || $('meta[name="citation_title"]').attr('content') || '';

  // citation_author meta tags: "LastName, FirstName" format — most reliable
  const authorMetas: string[] = [];
  const institutionMetas: string[] = [];
  $('meta[name="citation_author"]').each((_, el) => {
    authorMetas.push($(el).attr('content') || '');
  });
  $('meta[name="citation_author_institution"]').each((_, el) => {
    institutionMetas.push($(el).attr('content') || '');
  });

  const allInstitutions = [...new Set(institutionMetas.filter(Boolean))];
  const singleInstitution = allInstitutions.length === 1 ? allInstitutions[0] : '';

  // Build "Name (Institution)" lines using meta tags directly
  // When counts match: pair by index. Otherwise: assign singleInstitution to all, or leave blank.
  const authorLines = authorMetas.map((name, i) => {
    const inst = institutionMetas[i]                         // exact pair
      || (singleInstitution ? singleInstitution : '');       // only one org → applies to all
    return inst ? `${name} (${inst})` : name;
  });

  const abstract = $('blockquote.abstract').text().replace('Abstract:', '').trim()
    || $('meta[name="description"]').attr('content') || '';

  // Fallback: affiliations in HTML table
  const htmlAffiliations = $('td.tablecell.affiliations').text().trim();

  const emails: string[] = [];
  $('a[href^="mailto:"]').each((_, el) => {
    const email = ($(el).attr('href') || '').replace('mailto:', '').split('?')[0].trim();
    if (email.includes('@')) emails.push(email);
  });

  return [
    `Paper Title: ${title}`,
    `Authors with affiliations: ${authorLines.join('; ')}`,
    allInstitutions.length > 1 ? `All institutions: ${allInstitutions.join(', ')}` : '',
    htmlAffiliations ? `Affiliations: ${htmlAffiliations}` : '',
    `Abstract: ${abstract.slice(0, 800)}`,
    emails.length ? `[EMAILS_FOUND: ${emails.join(', ')}]` : '',
    `Source URL: ${absUrl}`,
  ].filter(Boolean).join('\n');
}

// Extract email from parsed HTML using 3 strategies: mailto links, plain text regex, obfuscated patterns
function extractEmailFromHtml($: cheerio.CheerioAPI): string {
  // 1. mailto: links — most reliable
  let found = '';
  $('a[href^="mailto:"]').each((_, el) => {
    if (found) return;
    const e = ($(el).attr('href') || '').replace('mailto:', '').split('?')[0].trim();
    if (e.includes('@') && e.includes('.')) found = e;
  });
  if (found) return found;

  // 2. Plain text regex — remove scripts/styles first to avoid false positives
  $('script, style, noscript').remove();
  const bodyText = $('body').text();

  const plainMatch = bodyText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (plainMatch) return plainMatch[0];

  // 3. Obfuscated: "user [at] domain [dot] com" or "user AT domain DOT com"
  const obfMatch = bodyText.match(
    /([a-zA-Z0-9._%+\-]{2,})\s*[\[\(]?\s*(?:at|AT|@)\s*[\]\)]?\s*([a-zA-Z0-9.\-]+)\s*[\[\(]?\s*(?:dot|DOT|\.)\s*[\]\)]?\s*([a-zA-Z]{2,6})\b/
  );
  if (obfMatch) return `${obfMatch[1]}@${obfMatch[2]}.${obfMatch[3]}`;

  return '';
}

// Fetch homepage and extract profile links (scholar, github, linkedin, email)
async function scrapeProfileLinks(homepage: string): Promise<{
  email: string; googleScholar: string; github: string; linkedin: string;
}> {
  const result = { email: '', googleScholar: '', github: '', linkedin: '' };
  const subpages = ['', '/about', '/contact'];
  for (const sub of subpages) {
    try {
      const html = await fetchHtml(homepage.replace(/\/$/, '') + sub);
      const $ = cheerio.load(html);

      // Email: use dedicated extractor (mailto + plain text + obfuscated)
      if (!result.email) {
        result.email = extractEmailFromHtml($);
      }
      // Google Scholar
      if (!result.googleScholar) {
        $('a[href*="scholar.google"]').each((_, el) => {
          result.googleScholar = $(el).attr('href') || '';
        });
      }
      // GitHub
      if (!result.github) {
        $('a[href*="github.com"]').each((_, el) => {
          const href = $(el).attr('href') || '';
          if (/github\.com\/[a-zA-Z0-9_-]+$/.test(href)) result.github = href;
        });
      }
      // LinkedIn
      if (!result.linkedin) {
        $('a[href*="linkedin.com/in/"]').each((_, el) => {
          result.linkedin = $(el).attr('href') || '';
        });
      }
      if (result.email && result.googleScholar && result.github && result.linkedin) break;
    } catch { /* subpage unreachable */ }
  }
  return result;
}

async function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// Semantic Scholar: search author by name → return homepage + S2 profile URL
async function lookupSemanticScholar(firstName: string, lastName: string): Promise<{
  homepage: string; s2Url: string;
}> {
  const query = encodeURIComponent(`${firstName} ${lastName}`);
  try {
    const { data } = await axios.get(
      `https://api.semanticscholar.org/graph/v1/author/search?query=${query}&fields=name,affiliations,homepage,externalIds`,
      { timeout: 8000, headers: { 'User-Agent': 'ResearcherMapper/1.0' } }
    );
    const authors: any[] = data.data || [];
    if (!authors.length) return { homepage: '', s2Url: '' };

    const f = firstName.toLowerCase();
    const l = lastName.toLowerCase();

    // Find best match: prefer exact name match
    const match = authors.find(a => {
      const n = (a.name || '').toLowerCase();
      return n.includes(f) && n.includes(l);
    }) || authors[0];

    let hp = match.homepage || '';
    if (hp && !hp.startsWith('http')) hp = 'https://' + hp;
    const s2Url = match.authorId ? `https://www.semanticscholar.org/author/${match.authorId}` : '';
    return { homepage: hp, s2Url };
  } catch { return { homepage: '', s2Url: '' }; }
}

// GitHub API: try common username patterns → get profile + homepage (blog field) + email
async function lookupGitHub(firstName: string, lastName: string): Promise<{
  github: string; homepage: string; email: string;
}> {
  const f = firstName.toLowerCase().replace(/\s/g, '');
  const l = lastName.toLowerCase().replace(/\s/g, '');
  const variants = [
    f + l, f + '-' + l, l + f, f[0] + l,
    f + l[0], f.slice(0, 3) + l, l + '-' + f,
  ];
  for (const username of variants) {
    try {
      const { data } = await axios.get(`https://api.github.com/users/${username}`, {
        timeout: 5000,
        headers: { 'User-Agent': 'ResearcherMapper/1.0' },
      });
      // Only accept if GitHub name field actually contains first or last name
      const ghName = (data.name || '').toLowerCase();
      if (!ghName || (!ghName.includes(f) && !ghName.includes(l))) {
        await delay(150);
        continue; // Skip — name doesn't match, likely a different person
      }
      let hp = data.blog || '';
      if (hp && !hp.startsWith('http')) hp = 'https://' + hp;
      // If no blog, try GitHub Pages URL
      if (!hp) hp = `https://${username}.github.io`;
      const email = data.email || '';
      return { github: data.html_url, homepage: hp, email };
    } catch { /* username not found */ }
    await delay(150);
  }
  return { github: '', homepage: '', email: '' };
}

// Verify if a URL actually returns a non-404 response
async function urlExists(url: string): Promise<boolean> {
  try {
    const { status } = await axios.head(url, { timeout: 5000, maxRedirects: 3 });
    return status < 400;
  } catch { return false; }
}

// Google Search via Serper.dev → returns organic result URLs
async function searchGoogle(query: string, serperKey: string): Promise<Array<{ url: string; title: string; snippet: string }>> {
  try {
    const { data } = await axios.post(
      'https://google.serper.dev/search',
      { q: query, num: 10, gl: 'us', hl: 'en' },
      { headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' }, timeout: 8000 }
    );
    return (data.organic || []).map((item: any) => ({
      url: item.link || '',
      title: item.title || '',
      snippet: item.snippet || '',
    }));
  } catch (e: any) {
    console.warn('[serper] search failed:', e.message);
    return [];
  }
}

// Regex-based fallback: extract profile links from search results
// Used when Qwen is unavailable or as a safety net
function extractProfilesFromSearchRegex(
  results: Array<{ url: string; title: string; snippet: string }>,
  firstName: string, lastName: string
): { linkedin: string; googleScholar: string; github: string; homepage: string; email: string } {
  const out = { linkedin: '', googleScholar: '', github: '', homepage: '', email: '' };
  const fn = firstName.toLowerCase();
  const ln = lastName.toLowerCase();

  // Check if a result plausibly belongs to this person (name in title or snippet)
  const nameMatch = (title: string, snippet: string) => {
    const t = (title + ' ' + snippet).toLowerCase();
    return t.includes(fn) || t.includes(ln);
  };

  for (const { url, title, snippet } of results) {
    if (!nameMatch(title, snippet)) continue; // skip results that don't mention the name

    if (!out.linkedin && /linkedin\.com\/in\/[a-zA-Z0-9_%-]+/.test(url)) {
      out.linkedin = url.split('?')[0];
    }
    if (!out.googleScholar && /scholar\.google\.com\/citations\?.*user=/.test(url)) {
      // Keep only the user= param (strip hl=, view_op=, etc.)
      const userParam = url.match(/user=[^&]+/)?.[0];
      out.googleScholar = userParam ? `https://scholar.google.com/citations?${userParam}` : url;
    }
    if (!out.github && /github\.com\/[a-zA-Z0-9_-]+$/.test(url)) {
      out.github = url;
    }
    // Exclude known large platforms; allow sites.google.com (Google Sites = personal homepage)
    const notHomepage = /linkedin\.com|github\.com|scholar\.google|(?:^|\.)google\.com|twitter\.com|facebook\.com|youtube\.com|wikipedia\.org|arxiv\.org|semanticscholar\.org|researchgate\.net|orcid\.org/i.test(url);
    if (!out.homepage && !notHomepage) {
      out.homepage = url;
    }
    // Also allow sites.google.com and scholar.google.com-hosted personal pages
    if (!out.homepage && /sites\.google\.com\//.test(url)) {
      out.homepage = url;
    }
    if (!out.email) {
      const emailMatch = (snippet + ' ' + title).match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) out.email = emailMatch[0];
    }
  }
  return out;
}

// Qwen-powered profile extraction from search results — much more accurate than regex
// Qwen reads title+snippet+url and reasons about which URLs belong to this specific person
async function extractProfilesWithQwen(
  results: Array<{ url: string; title: string; snippet: string }>,
  firstName: string, lastName: string, company: string
): Promise<{ linkedin: string; googleScholar: string; github: string; homepage: string; email: string }> {
  const empty = { linkedin: '', googleScholar: '', github: '', homepage: '', email: '' };
  try {
    const client = await getClient();
    const resultsSummary = results.slice(0, 8).map((r, i) =>
      `[${i + 1}] Title: ${r.title}\n     URL: ${r.url}\n     Snippet: ${r.snippet}`
    ).join('\n\n');

    const prompt = `You are helping identify online profiles for a specific researcher.

Researcher: ${firstName} ${lastName}${company ? ` (${company})` : ''}

Google search results:
${resultsSummary}

Task: From the above search results, identify which URLs belong to THIS specific person (not a different person with the same name). Return a JSON object with these fields:
- linkedin: LinkedIn profile URL (must be linkedin.com/in/..., only if clearly this person)
- googleScholar: Google Scholar profile URL (must contain citations?user=..., only direct profile page)
- github: GitHub profile URL (must be github.com/username, only if clearly this person)
- homepage: Personal website or academic homepage (can be sites.google.com, university .edu page, or personal domain)
- email: Email address if found in any snippet or title

Rules:
- Use null for any field you are NOT confident about
- Do NOT guess — only include URLs you are sure belong to this specific researcher
- For googleScholar, only use citations?user=... URLs, never scholar?q= search URLs
- Return ONLY valid JSON, no explanation`;

    const response = await client.chat.completions.create({
      model: 'qwen-plus',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
    });
    const raw = (response.choices[0]?.message?.content || '{}')
      .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(raw);
    return {
      linkedin: parsed.linkedin || '',
      googleScholar: parsed.googleScholar || '',
      github: parsed.github || '',
      homepage: parsed.homepage || '',
      email: parsed.email || '',
    };
  } catch (e: any) {
    console.warn('[qwen-profiles] failed, falling back to regex:', e.message);
    return empty;
  }
}

// Full profile enrichment: Google Search → homepage scrape → S2 fallback → GitHub fallback
async function enrichResearcher(r: any, index: number): Promise<void> {
  await delay(index * 1500);

  const firstName = r.firstName || '';
  const lastName = r.lastName || '';
  if (!firstName && !lastName) return;

  const fullName = `${firstName} ${lastName}`;
  const company = r.currentOrg || '';
  console.log(`[enrich] ${fullName}`);

  // ── Step 1: Google Search + Qwen parsing (most accurate) ──
  const serperKey = await getSerperKey();
  if (serperKey) {
    // Search with company for disambiguation (e.g. "Haibin Lin ByteDance")
    const query = company ? `${fullName} ${company}` : fullName;
    console.log(`[enrich] Google search: "${query}"`);
    const results = await searchGoogle(query, serperKey);

    // Primary: Qwen reads title+snippet+url and picks the right profiles
    let found = await extractProfilesWithQwen(results, firstName, lastName, company);

    // If Qwen found nothing useful, fall back to regex
    if (!found.linkedin && !found.googleScholar && !found.github && !found.homepage) {
      found = extractProfilesFromSearchRegex(results, firstName, lastName);
    }
    console.log(`[enrich] profiles found:`, JSON.stringify(found));

    if (found.linkedin && !r.linkedin) r.linkedin = found.linkedin;
    if (found.googleScholar && !r.googleScholar) r.googleScholar = found.googleScholar;
    if (found.github && !r.github) r.github = found.github;
    if (found.homepage && !r.homepage) r.homepage = found.homepage;
    if (found.email && !r.email) r.email = found.email;

    // If still missing Scholar or homepage, retry with name-only search
    if (company && (!r.googleScholar || !r.homepage)) {
      await delay(300);
      const results2 = await searchGoogle(fullName, serperKey);
      let found2 = await extractProfilesWithQwen(results2, firstName, lastName, '');
      if (!found2.linkedin && !found2.googleScholar && !found2.github && !found2.homepage) {
        found2 = extractProfilesFromSearchRegex(results2, firstName, lastName);
      }
      if (found2.googleScholar && !r.googleScholar) r.googleScholar = found2.googleScholar;
      if (found2.homepage && !r.homepage) r.homepage = found2.homepage;
      if (found2.linkedin && !r.linkedin) r.linkedin = found2.linkedin;
      if (found2.github && !r.github) r.github = found2.github;
      if (found2.email && !r.email) r.email = found2.email;
    }
  }

  // ── Step 2: Scrape homepage to fill remaining gaps (Scholar, LinkedIn, email) ──
  if (r.homepage && (!r.email || !r.googleScholar || !r.linkedin)) {
    try {
      const links = await scrapeProfileLinks(r.homepage);
      if (links.email && !r.email) r.email = links.email;
      if (links.googleScholar && !r.googleScholar) r.googleScholar = links.googleScholar;
      if (links.github && !r.github) r.github = links.github;
      if (links.linkedin && !r.linkedin) r.linkedin = links.linkedin;
    } catch { /* homepage unreachable */ }
  }

  // ── Step 3: Semantic Scholar fallback (if Google found nothing) ──
  if (!r.homepage && !serperKey) {
    const s2 = await lookupSemanticScholar(firstName, lastName);
    if (s2.homepage) r.homepage = s2.homepage;
    await delay(1100);
  }

  // ── Step 4: GitHub API fallback (if still no GitHub) ──
  if (!r.github) {
    const gh = await lookupGitHub(firstName, lastName);
    if (gh.github) r.github = gh.github;
    if (gh.email && !r.email) r.email = gh.email;
    if (gh.homepage && !r.homepage) {
      if (gh.homepage.endsWith('.github.io')) {
        const exists = await urlExists(gh.homepage);
        if (exists) r.homepage = gh.homepage;
      } else {
        r.homepage = gh.homepage;
      }
    }
  }

  // ── Step 5: Final fallback — Google Scholar search URL (always clickable) ──
  if (!r.googleScholar) {
    r.googleScholar = `https://scholar.google.com/scholar?q=${encodeURIComponent(fullName)}`;
  }
}

// ── Qwen extraction ──────────────────────────────────────────────────────────

const RESEARCH_TAGS = ['Infra', 'Architecture', 'Post-training', 'RL', 'Reasoning', 'Safety', 'Interpretability', 'Multimodal', 'Video Gen', 'Data', 'Evaluation'];

const EXTRACTION_SYSTEM = `You are an expert at extracting AI researcher profiles from paper abstracts and web pages.

IMPORTANT: Always extract ALL authors/researchers mentioned. Even if you only know their name, still include them.

For each researcher, return a JSON object with these fields (use null for any unknown field):
- firstName, lastName: split the full name
- nameCN: Chinese name if present, else null
- email: if found, else null
- currentOrg: their institution/company. IMPORTANT: if the input contains "Authors with affiliations" lines like "John Smith (ByteDance Research)", extract "ByteDance Research" as currentOrg. If "All institutions" is listed, use it to infer each author's affiliation. Never leave this null if affiliation data is present.
- jobTitle: null
- team: null
- researchAreas: array using ONLY these tags (pick the most relevant, can be multiple): ${RESEARCH_TAGS.join(', ')}
- seniority: null
- education: null
- previousCompanies: []
- googleScholar: null
- github: null
- linkedin: null
- maimai: null
- openreview: null
- homepage: null
- contact: null
- notes: one-sentence note about their role in this paper, else null

Return ONLY a valid JSON array. No markdown, no explanation, no extra text.
If the input is a paper, extract ALL listed authors.`;

async function extractWithQwen(pageContent: string, sourceUrl: string): Promise<any[]> {
  const client = await getClient();
  const prompt = `Extract all AI researchers from the following web page content (source: ${sourceUrl}):\n\n${pageContent.slice(0, 12000)}`;
  console.log('[extract] Sending to Qwen, content preview:\n', pageContent.slice(0, 400));
  const response = await client.chat.completions.create({
    model: 'qwen-plus',
    messages: [
      { role: 'system', content: EXTRACTION_SYSTEM },
      { role: 'user', content: prompt },
    ],
    temperature: 0.1,
  });
  const raw = response.choices[0]?.message?.content || '[]';
  console.log('[extract] Qwen raw response:', raw.slice(0, 600));
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e: any) {
    console.error('[extract] JSON parse failed:', e.message, '| raw:', raw.slice(0, 200));
    return [];
  }
}

// ── Exported for re-enrich ───────────────────────────────────────────────────
export { enrichResearcher };

// ── Public API ────────────────────────────────────────────────────────────────

export async function extractFromUrl(paperUrl: string, projectId?: string): Promise<{ jobId: string }> {
  const job = await prisma.extractionJob.create({
    data: { paperUrl, status: 'PENDING', ...(projectId ? { projectId } : {}) } as any,
  });
  runExtraction(job.id, paperUrl).catch(console.error);
  return { jobId: job.id };
}

async function runExtraction(jobId: string, paperUrl: string) {
  await prisma.extractionJob.update({ where: { id: jobId }, data: { status: 'RUNNING' } });
  try {
    const fetchUrl = normalizeUrl(paperUrl);
    console.log(`[extract] fetching: ${fetchUrl}`);

    let rawText: string;
    if (fetchUrl.includes('arxiv.org/abs/')) {
      rawText = await fetchArxivStructured(fetchUrl);
    } else {
      rawText = await fetchText(fetchUrl);
    }
    if (!rawText.trim()) throw new Error(`Could not fetch page content from ${fetchUrl}`);
    console.log(`[extract] fetched ${rawText.length} chars`);

    // Extract paper title from rawText (first line: "Paper Title: ...")
    const titleMatch = rawText.match(/^Paper Title:\s*(.+)/m);
    const paperTitle = titleMatch?.[1]?.trim() || '';

    const extracted = await extractWithQwen(rawText, fetchUrl);
    console.log(`[extract] Qwen returned ${extracted.length} researchers`);
    if (!extracted.length) throw new Error(`Qwen returned no researchers. Page preview: ${rawText.slice(0, 300)}`);

    console.log(`[enrich] enriching ${extracted.length} researchers...`);
    await Promise.all(extracted.map((r, i) => enrichResearcher(r, i)));
    console.log(`[enrich] done`);

    for (const r of extracted) {
      r.researchAreas = JSON.stringify(r.researchAreas || []);
      r.previousCompanies = JSON.stringify(r.previousCompanies || []);
      r.sourceUrl = paperUrl;
    }

    const { bulkCreate } = await import('../researchers/researchers.service');
    const result = await bulkCreate(extracted);

    await (prisma.extractionJob as any).update({
      where: { id: jobId },
      data: { status: 'DONE', researchersFound: result.created + result.updated, paperTitle: paperTitle || null },
    });
  } catch (e: any) {
    await prisma.extractionJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', error: e.message },
    });
  }
}

export async function getJobStatus(jobId: string) {
  return prisma.extractionJob.findUnique({ where: { id: jobId } });
}

export async function listJobs() {
  return prisma.extractionJob.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
}

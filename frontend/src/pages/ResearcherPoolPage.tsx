import { useState, useEffect, useCallback } from 'react';
import { researchersApi, exportApi, projectsApi } from '../api/client';
import type { Researcher, ResearcherListResponse, Project } from '../types';
import { STATUSES, PRIORITIES } from '../types';

function safeJson(val?: string): string[] {
  if (!val) return [];
  try { return JSON.parse(val); } catch { return []; }
}

function fullName(r: Researcher) {
  return [r.firstName, r.lastName].filter(Boolean).join(' ') || r.nameCN || '—';
}

export default function ResearcherPoolPage() {
  const [data, setData] = useState<ResearcherListResponse | null>(null);
  const [filters, setFilters] = useState({ q: '', company: '', status: '', priority: '', page: 1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Researcher | null>(null);
  const [pushOpen, setPushOpen] = useState(false);
  const [pushForm, setPushForm] = useState({ icebreakerUrl: '', icebreakerApiKey: '', campaignId: '' });
  const [pushLoading, setPushLoading] = useState(false);
  const [pushResult, setPushResult] = useState<any>(null);
  const [reEnrichStatus, setReEnrichStatus] = useState<string | null>(null);
  const [addToPoolOpen, setAddToPoolOpen] = useState(false);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [addToPoolLoading, setAddToPoolLoading] = useState(false);

  const load = useCallback(async () => {
    const res = await researchersApi.list({
      q: filters.q || undefined,
      company: filters.company || undefined,
      status: filters.status || undefined,
      priority: filters.priority || undefined,
      page: filters.page,
      limit: 20,
    });
    setData(res.data);
    setSelected(new Set());
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  // Pre-convert JSON array fields to CSV strings for editing
  function openEdit(r: Researcher) {
    setEditing({
      ...r,
      researchAreas: safeJson(r.researchAreas).join(', ') || '',
      previousCompanies: safeJson(r.previousCompanies).join(', ') || '',
    } as any);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this researcher?')) return;
    await researchersApi.delete(id);
    load();
  }

  async function handleSaveEdit() {
    if (!editing) return;
    const toJsonArray = (val: string | null | undefined) => {
      if (!val) return '[]';
      try { JSON.parse(val); return val; } catch { /**/ }
      return JSON.stringify(val.split(',').map(s => s.trim()).filter(Boolean));
    };
    const e = editing as any;
    const payload = {
      firstName: e.firstName || null,
      lastName: e.lastName || null,
      nameCN: e.nameCN || null,
      email: e.email || null,
      currentOrg: e.currentOrg || null,
      jobTitle: e.jobTitle || null,
      team: e.team || null,
      seniority: e.seniority || null,
      education: e.education || null,
      googleScholar: e.googleScholar || null,
      github: e.github || null,
      linkedin: e.linkedin || null,
      homepage: e.homepage || null,
      maimai: e.maimai || null,
      openreview: e.openreview || null,
      contact: e.contact || null,
      notes: e.notes || null,
      status: e.status,
      priority: e.priority,
      researchAreas: toJsonArray(e.researchAreas),
      previousCompanies: toJsonArray(e.previousCompanies),
    };
    await researchersApi.update(editing.id, payload);
    setEditing(null);
    load();
  }

  async function handleExportCsv() {
    const ids = selected.size ? [...selected] : undefined;
    const res = await exportApi.csv(ids);
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url; a.download = 'researchers.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  async function openAddToPool() {
    const res = await projectsApi.list();
    setAllProjects(res.data);
    setSelectedJobId('');
    setAddToPoolOpen(true);
  }

  async function handleAddToPool() {
    if (!selectedJobId || selected.size === 0) return;
    setAddToPoolLoading(true);
    await projectsApi.addResearchersToPool(selectedJobId, [...selected]);
    setAddToPoolLoading(false);
    setAddToPoolOpen(false);
    setSelected(new Set());
  }

  async function handleReEnrich() {
    const ids = selected.size ? [...selected] : undefined;
    const res = await researchersApi.reEnrich(ids);
    setReEnrichStatus(`Re-enriching ${res.data.count} researchers in background — refresh in a few minutes`);
    setTimeout(() => setReEnrichStatus(null), 8000);
  }

  async function handlePush() {
    setPushLoading(true);
    try {
      const res = await exportApi.push({ ...pushForm, researcherIds: [...selected] });
      setPushResult(res.data);
    } catch (e: any) {
      setPushResult({ error: e.response?.data?.error || e.message });
    }
    setPushLoading(false);
  }

  const toggleSelect = (id: string) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const priorityBadge = (p: string) => ({
    '高': 'bg-red-100 text-red-700',
    '中': 'bg-yellow-100 text-yellow-700',
    '低': 'bg-gray-100 text-gray-600',
  }[p] || 'bg-gray-100 text-gray-600');

  const statusBadge = (s: string) => ({
    '未接触': 'bg-gray-100 text-gray-600',
    '已联系': 'bg-blue-100 text-blue-700',
    '合作中': 'bg-green-100 text-green-700',
    '不适合': 'bg-red-100 text-red-500',
  }[s] || 'bg-gray-100');

  return (
    <div className="max-w-7xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Researcher Pool</h1>
          {data && <p className="text-sm text-gray-500 mt-0.5">{data.total} researchers total</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={handleReEnrich} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">
            Re-enrich {selected.size > 0 ? `(${selected.size})` : '(all)'}
          </button>
          <button onClick={handleExportCsv} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">
            Export CSV {selected.size > 0 ? `(${selected.size})` : '(all)'}
          </button>
          {selected.size > 0 && (
            <button onClick={openAddToPool} className="text-sm bg-green-600 text-white rounded-lg px-3 py-1.5 hover:bg-green-700">
              加入 Pool ({selected.size})
            </button>
          )}
          {selected.size > 0 && (
            <button onClick={() => { setPushOpen(true); setPushResult(null); }} className="text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700">
              Push to Icebreaker ({selected.size})
            </button>
          )}
        </div>
      </div>

      {/* Re-enrich status toast */}
      {reEnrichStatus && (
        <div className="mb-4 text-sm bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-lg">
          {reEnrichStatus}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value, page: 1 }))}
          placeholder="Search name / company / email…"
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input value={filters.company} onChange={e => setFilters(f => ({ ...f, company: e.target.value, page: 1 }))}
          placeholder="Org" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Status</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={filters.priority} onChange={e => setFilters(f => ({ ...f, priority: e.target.value, page: 1 }))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Priority</option>
          {PRIORITIES.map(p => <option key={p}>{p}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 w-8"><input type="checkbox"
                checked={data?.researchers.length ? data.researchers.every(r => selected.has(r.id)) : false}
                onChange={e => { if (e.target.checked) { setSelected(new Set(data?.researchers.map(r => r.id))); } else setSelected(new Set()); }} /></th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Org</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Research Areas</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Profiles</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Priority</th>
              <th className="px-4 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data?.researchers.map(r => (
              <tr key={r.id} className={`hover:bg-gray-50 ${selected.has(r.id) ? 'bg-blue-50' : ''}`}>
                <td className="px-4 py-3"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{fullName(r)}</div>
                  {r.seniority && <div className="text-xs text-gray-400">{r.seniority}</div>}
                </td>
                <td className="px-4 py-3 text-gray-700">{r.currentOrg || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {safeJson(r.researchAreas).slice(0, 3).map(tag => (
                      <span key={tag} className="text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">{tag}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs font-mono">{r.email || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {r.googleScholar && (
                      <a href={r.googleScholar} target="_blank" rel="noreferrer"
                        title="Google Scholar" className="text-blue-500 hover:text-blue-700 text-xs font-medium">GS</a>
                    )}
                    {r.github && (
                      <a href={r.github} target="_blank" rel="noreferrer"
                        title="GitHub" className="text-gray-700 hover:text-black text-xs font-medium">GH</a>
                    )}
                    {r.linkedin && (
                      <a href={r.linkedin} target="_blank" rel="noreferrer"
                        title="LinkedIn" className="text-blue-600 hover:text-blue-800 text-xs font-medium">LI</a>
                    )}
                    {r.homepage && (
                      <a href={r.homepage} target="_blank" rel="noreferrer"
                        title="Homepage" className="text-purple-500 hover:text-purple-700 text-xs font-medium">HP</a>
                    )}
                    {!r.googleScholar && !r.github && !r.linkedin && !r.homepage && (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(r.status)}`}>{r.status}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityBadge(r.priority)}`}>{r.priority}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(r)} className="text-blue-500 hover:text-blue-700 text-xs">Edit</button>
                    <button onClick={() => handleDelete(r.id)} className="text-red-400 hover:text-red-600 text-xs">Del</button>
                  </div>
                </td>
              </tr>
            ))}
            {data?.researchers.length === 0 && (
              <tr><td colSpan={8} className="text-center py-12 text-gray-400">No researchers found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.total > data.limit && (
        <div className="flex justify-center gap-2 mt-4">
          <button disabled={filters.page <= 1} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
            className="px-3 py-1 text-sm border rounded disabled:opacity-40">← Prev</button>
          <span className="px-3 py-1 text-sm text-gray-600">Page {filters.page} / {Math.ceil(data.total / data.limit)}</span>
          <button disabled={filters.page >= Math.ceil(data.total / data.limit)} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
            className="px-3 py-1 text-sm border rounded disabled:opacity-40">Next →</button>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-5">Edit Researcher</h2>

            {/* Basic Info */}
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Basic Info</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {(['firstName','lastName','nameCN','email'] as const).map(f => (
                <div key={f}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{f}</label>
                  <input value={(editing as any)[f] || ''} onChange={e => setEditing({ ...editing, [f]: e.target.value })}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {(['currentOrg','jobTitle','team','seniority','education'] as const).map(f => (
                <div key={f}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{f}</label>
                  <input value={(editing as any)[f] || ''} onChange={e => setEditing({ ...editing, [f]: e.target.value })}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              ))}
            </div>

            {/* Profile Links */}
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Profile Links</p>
            <div className="space-y-2 mb-4">
              {(['googleScholar','github','linkedin','homepage','maimai','openreview'] as const).map(f => (
                <div key={f} className="flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-600 w-28 shrink-0">{f}</label>
                  <input value={(editing as any)[f] || ''} onChange={e => setEditing({ ...editing, [f]: e.target.value })}
                    placeholder="https://..."
                    className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono" />
                  {(editing as any)[f] && (
                    <a href={(editing as any)[f]} target="_blank" rel="noreferrer"
                      className="text-xs text-blue-500 hover:text-blue-700 shrink-0">Open ↗</a>
                  )}
                </div>
              ))}
            </div>

            {/* Research */}
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Research</p>
            <div className="space-y-2 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  researchAreas <span className="text-gray-400 font-normal">(comma-separated: RL, Infra, Safety…)</span>
                </label>
                <input
                  value={(editing as any).researchAreas || ''}
                  onChange={e => setEditing({ ...editing, researchAreas: e.target.value } as any)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  previousCompanies <span className="text-gray-400 font-normal">(comma-separated)</span>
                </label>
                <input
                  value={(editing as any).previousCompanies || ''}
                  onChange={e => setEditing({ ...editing, previousCompanies: e.target.value } as any)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>

            {/* Status & Notes */}
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Status & Notes</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">status</label>
                <select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">priority</label>
                <select value={editing.priority} onChange={e => setEditing({ ...editing, priority: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              {(['contact','notes'] as const).map(f => (
                <div key={f}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{f}</label>
                  <input value={(editing as any)[f] || ''} onChange={e => setEditing({ ...editing, [f]: e.target.value })}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
              <button onClick={handleSaveEdit} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* 加入 Pool 弹窗 */}
      {addToPoolOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-1">加入 Pool</h2>
            <p className="text-sm text-gray-500 mb-4">已选 {selected.size} 位研究员，选择要加入的 Pool：</p>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {allProjects.length === 0 && <p className="text-sm text-gray-400">暂无 Project</p>}
              {allProjects.map(proj => (
                <div key={proj.id}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 mt-2">{proj.name}</p>
                  {proj.jobs.filter(j => j.status === 'DONE').map(job => (
                    <label key={job.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition ${selectedJobId === job.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}>
                      <input type="radio" name="pool" value={job.id} checked={selectedJobId === job.id}
                        onChange={() => setSelectedJobId(job.id)} className="accent-blue-600" />
                      <span className="text-sm text-gray-800 truncate">{job.poolName || job.paperTitle || job.paperUrl}</span>
                      <span className="text-xs text-gray-400 ml-auto shrink-0">{job.researchersFound} 人</span>
                    </label>
                  ))}
                  {proj.jobs.filter(j => j.status === 'DONE').length === 0 && (
                    <p className="text-xs text-gray-400 pl-2">无可用 Pool</p>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setAddToPoolOpen(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleAddToPool} disabled={!selectedJobId || addToPoolLoading}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40">
                {addToPoolLoading ? '加入中…' : '确认加入'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Push to Icebreaker Modal */}
      {pushOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-1">Push to Icebreaker</h2>
            <p className="text-sm text-gray-500 mb-4">{selected.size} researchers selected</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Icebreaker Backend URL
                  <span className="text-gray-400 font-normal ml-1">(backend port 3200, not frontend 5300)</span>
                </label>
                <input value={pushForm.icebreakerUrl} onChange={e => setPushForm(f => ({ ...f, icebreakerUrl: e.target.value }))}
                  placeholder="http://localhost:3200" className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">API Key</label>
                <input value={pushForm.icebreakerApiKey} onChange={e => setPushForm(f => ({ ...f, icebreakerApiKey: e.target.value }))}
                  type="password" placeholder="your-icebreaker-api-key" className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Campaign ID</label>
                <input value={pushForm.campaignId} onChange={e => setPushForm(f => ({ ...f, campaignId: e.target.value }))}
                  placeholder="campaign UUID" className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
            {pushResult && (
              <div className={`mt-3 text-sm p-3 rounded ${pushResult.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {pushResult.error || `✓ ${JSON.stringify(pushResult)}`}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => { setPushOpen(false); setPushResult(null); }} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Close</button>
              <button onClick={handlePush} disabled={pushLoading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40">
                {pushLoading ? 'Pushing…' : 'Push'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

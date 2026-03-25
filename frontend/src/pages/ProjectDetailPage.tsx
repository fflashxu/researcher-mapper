import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectsApi, extractApi, researchersApi } from '../api/client';
import type { Project, ExtractionJob, Researcher } from '../types';
import { STATUSES, PRIORITIES } from '../types';

function safeJson(val?: string): string[] {
  if (!val) return [];
  try { return JSON.parse(val); } catch { return []; }
}

function fullName(r: Researcher) {
  return [r.firstName, r.lastName].filter(Boolean).join(' ') || r.nameCN || '—';
}

const statusColor = (s: string) => ({
  PENDING: 'bg-yellow-100 text-yellow-700',
  RUNNING: 'bg-blue-100 text-blue-700',
  DONE: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-600',
}[s] || 'bg-gray-100 text-gray-500');

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [urls, setUrls] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [poolResearchers, setPoolResearchers] = useState<Researcher[]>([]);
  const [poolJob, setPoolJob] = useState<ExtractionJob | null>(null);
  const [editingPoolName, setEditingPoolName] = useState<string | null>(null);
  const [poolNameDraft, setPoolNameDraft] = useState('');
  const [editing, setEditing] = useState<Researcher | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (!project) return;
    const hasRunning = project.jobs.some(j => j.status === 'PENDING' || j.status === 'RUNNING');
    if (hasRunning && !pollingRef.current) {
      pollingRef.current = setInterval(() => load(), 2000);
    } else if (!hasRunning && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; } };
  }, [project]);

  async function load() {
    if (!id) return;
    const res = await projectsApi.get(id);
    setProject(res.data);
  }

  async function loadPool(jobId: string) {
    const res = await projectsApi.getPoolResearchers(jobId);
    setPoolResearchers(res.data.researchers);
  }

  async function handleExtract() {
    const lines = urls.split(/[\n\s,]+/).map(u => u.trim()).filter(u => u.startsWith('http'));
    if (!lines.length) return;
    setExtracting(true);
    for (const url of lines) {
      try { await extractApi.start(url, id); } catch { /* ignore individual failures */ }
    }
    setUrls('');
    setExtracting(false);
    load();
  }

  function poolDisplayName(job: ExtractionJob) {
    return job.poolName || job.paperTitle || job.paperUrl.replace('https://arxiv.org/abs/', 'arXiv ');
  }

  async function handleSavePoolName(jobId: string) {
    await projectsApi.updatePoolName(jobId, poolNameDraft.trim());
    setEditingPoolName(null);
    load();
  }

  async function handleSelectPool(job: ExtractionJob) {
    if (selectedPool === job.id) {
      setSelectedPool(null);
      setPoolResearchers([]);
      setPoolJob(null);
      return;
    }
    setSelectedPool(job.id);
    setPoolJob(job);
    const res = await projectsApi.getPoolResearchers(job.id);
    setPoolResearchers(res.data.researchers);
  }

  function openEdit(r: Researcher) {
    setEditing({
      ...r,
      researchAreas: safeJson(r.researchAreas).join(', ') || '',
      previousCompanies: safeJson(r.previousCompanies).join(', ') || '',
    } as any);
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
    if (selectedPool) loadPool(selectedPool);
  }

  if (!project) return <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>;

  return (
    <div className="max-w-7xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
        <button onClick={() => navigate('/projects')} className="text-gray-400 hover:text-gray-600 mt-1 text-sm">← Projects</button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-gray-900">{project.name}</h1>
          {project.description && <p className="text-sm text-gray-500 mt-0.5">{project.description}</p>}
          <p className="text-sm text-gray-400 mt-1">{project.jobs.length} pools · {project.jobs.reduce((s, j) => s + j.researchersFound, 0)} researchers total</p>
        </div>
      </div>

      <div className="grid grid-cols-[320px_1fr] gap-6">
        {/* LEFT: Pools list + add paper */}
        <div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Add Papers</p>
            <textarea value={urls} onChange={e => setUrls(e.target.value)}
              placeholder={"https://arxiv.org/abs/2401.00001\nhttps://arxiv.org/abs/2312.12345"}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            <button onClick={handleExtract} disabled={extracting || !urls.trim()}
              className="mt-2 w-full bg-blue-600 text-white text-sm py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-40">
              {extracting ? 'Starting…' : 'Extract Researchers'}
            </button>
          </div>

          <div className="space-y-2">
            {project.jobs.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">No papers yet — add one above</p>
            )}
            {project.jobs.map(job => (
              <div key={job.id}
                onClick={() => job.status === 'DONE' && editingPoolName !== job.id && handleSelectPool(job)}
                className={`border rounded-xl p-3 transition group ${
                  job.status === 'DONE' ? 'cursor-pointer hover:border-blue-300' : 'cursor-default opacity-70'
                } ${selectedPool === job.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {editingPoolName === job.id ? (
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <input
                          autoFocus
                          value={poolNameDraft}
                          onChange={e => setPoolNameDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSavePoolName(job.id); if (e.key === 'Escape') setEditingPoolName(null); }}
                          className="flex-1 text-sm border border-blue-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button onClick={() => handleSavePoolName(job.id)} className="text-green-600 hover:text-green-800 text-xs">✓</button>
                        <button onClick={() => setEditingPoolName(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{poolDisplayName(job)}</p>
                        <button
                          onClick={e => { e.stopPropagation(); setEditingPoolName(job.id); setPoolNameDraft(poolDisplayName(job)); }}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 text-xs shrink-0 transition-opacity"
                        >✎</button>
                      </div>
                    )}
                    <p className="text-xs text-gray-400 truncate mt-0.5">{job.paperUrl}</p>
                  </div>
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full shrink-0 ${statusColor(job.status)}`}>
                    {job.status === 'RUNNING' ? '⏳' : job.status === 'DONE' ? `${job.researchersFound}` : job.status}
                  </span>
                </div>
                {job.error && <p className="text-xs text-red-500 mt-1 truncate">{job.error}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Researchers table */}
        <div>
          {!selectedPool ? (
            <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-200 rounded-xl text-gray-400">
              <p className="text-sm">← Click a pool to view researchers</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700">
                  {poolJob?.paperTitle || 'Pool'} · {poolResearchers.length} researchers
                </h2>
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-600 text-xs">Name</th>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-600 text-xs">Org</th>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-600 text-xs">Research Areas</th>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-600 text-xs">Email</th>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-600 text-xs">Profiles</th>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-600 text-xs"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {poolResearchers.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-gray-900 text-xs">{fullName(r)}</div>
                          {r.nameCN && <div className="text-xs text-gray-400">{r.nameCN}</div>}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 text-xs">{r.currentOrg || '—'}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {safeJson(r.researchAreas).slice(0, 2).map(tag => (
                              <span key={tag} className="text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">{tag}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs font-mono">{r.email || '—'}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-2">
                            {r.googleScholar && <a href={r.googleScholar} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700 text-xs font-medium">GS</a>}
                            {r.github && <a href={r.github} target="_blank" rel="noreferrer" className="text-gray-700 hover:text-black text-xs font-medium">GH</a>}
                            {r.linkedin && <a href={r.linkedin} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 text-xs font-medium">LI</a>}
                            {r.homepage && <a href={r.homepage} target="_blank" rel="noreferrer" className="text-purple-500 hover:text-purple-700 text-xs font-medium">HP</a>}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <button onClick={() => openEdit(r)} className="text-blue-500 hover:text-blue-700 text-xs">Edit</button>
                        </td>
                      </tr>
                    ))}
                    {poolResearchers.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-8 text-gray-400 text-sm">No researchers in this pool</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-5">Edit Researcher</h2>

            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Basic Info</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {(['firstName','lastName','nameCN','email'] as const).map(f => (
                <div key={f}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{f}</label>
                  <input value={(editing as any)[f] || ''} onChange={e => setEditing({ ...editing, [f]: e.target.value } as any)}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {(['currentOrg','jobTitle','team','seniority','education'] as const).map(f => (
                <div key={f}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{f}</label>
                  <input value={(editing as any)[f] || ''} onChange={e => setEditing({ ...editing, [f]: e.target.value } as any)}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              ))}
            </div>

            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Profile Links</p>
            <div className="space-y-2 mb-4">
              {(['googleScholar','github','linkedin','homepage','maimai','openreview'] as const).map(f => (
                <div key={f} className="flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-600 w-28 shrink-0">{f}</label>
                  <input value={(editing as any)[f] || ''} onChange={e => setEditing({ ...editing, [f]: e.target.value } as any)}
                    placeholder="https://..."
                    className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono" />
                  {(editing as any)[f] && (
                    <a href={(editing as any)[f]} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:text-blue-700 shrink-0">↗</a>
                  )}
                </div>
              ))}
            </div>

            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Research Areas</p>
            <div className="space-y-2 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">researchAreas <span className="text-gray-400 font-normal">（comma-sep: RL, Infra…）</span></label>
                <input value={(editing as any).researchAreas || ''} onChange={e => setEditing({ ...editing, researchAreas: e.target.value } as any)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">previousCompanies <span className="text-gray-400 font-normal">(comma-sep)</span></label>
                <input value={(editing as any).previousCompanies || ''} onChange={e => setEditing({ ...editing, previousCompanies: e.target.value } as any)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>

            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Status & Notes</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                <select value={editing.priority} onChange={e => setEditing({ ...editing, priority: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2 mb-5">
              {(['contact','notes'] as const).map(f => (
                <div key={f}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{f}</label>
                  <input value={(editing as any)[f] || ''} onChange={e => setEditing({ ...editing, [f]: e.target.value } as any)}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSaveEdit} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

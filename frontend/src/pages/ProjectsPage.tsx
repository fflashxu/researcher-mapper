import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsApi } from '../api/client';
import type { Project } from '../types';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await projectsApi.list();
    setProjects(res.data);
  }

  async function handleCreate() {
    if (!form.name.trim()) return;
    const res = await projectsApi.create({ name: form.name.trim(), description: form.description.trim() || undefined });
    setCreating(false);
    setForm({ name: '', description: '' });
    navigate(`/projects/${res.data.id}`);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete project "${name}" and all its pools?`)) return;
    await projectsApi.delete(id);
    load();
  }

  const statusColor = (s: string) => ({
    PENDING: 'bg-yellow-100 text-yellow-700',
    RUNNING: 'bg-blue-100 text-blue-700',
    DONE: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-600',
  }[s] || 'bg-gray-100 text-gray-500');

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500 mt-0.5">Each project groups paper extractions into pools</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700">
          + New Project
        </button>
      </div>

      {projects.length === 0 && !creating && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">No projects yet</p>
          <p className="text-sm">Create a project to start organizing your research</p>
        </div>
      )}

      <div className="space-y-4">
        {projects.map(p => (
          <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-300 transition cursor-pointer"
            onClick={() => navigate(`/projects/${p.id}`)}>
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-900">{p.name}</h2>
                {p.description && <p className="text-sm text-gray-500 mt-0.5">{p.description}</p>}
                <div className="flex gap-4 mt-2 text-sm text-gray-500">
                  <span>{p.poolCount} pool{p.poolCount !== 1 ? 's' : ''}</span>
                  <span>{p.totalResearchers} researchers</span>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4 shrink-0" onClick={e => e.stopPropagation()}>
                <button onClick={() => handleDelete(p.id, p.name)}
                  className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">Delete</button>
              </div>
            </div>

            {/* Pool preview chips */}
            {p.jobs.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {p.jobs.slice(0, 4).map(j => (
                  <span key={j.id} className="inline-flex items-center gap-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${j.status === 'DONE' ? 'bg-green-500' : j.status === 'RUNNING' ? 'bg-blue-500' : j.status === 'FAILED' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                    <span className="text-gray-700 max-w-[180px] truncate">{j.paperTitle || j.paperUrl}</span>
                    {j.status === 'DONE' && <span className="text-gray-400">{j.researchersFound}</span>}
                  </span>
                ))}
                {p.jobs.length > 4 && <span className="text-xs text-gray-400 py-1">+{p.jobs.length - 4} more</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Create Project Modal */}
      {creating && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">New Project</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Project name *</label>
                <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  placeholder="e.g. LLM Training Research Q1 2025"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="What is this project about?"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => { setCreating(false); setForm({ name: '', description: '' }); }}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleCreate} disabled={!form.name.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { extractApi } from '../api/client';
import type { ExtractionJob } from '../types';

export default function PaperInputPage() {
  const [urls, setUrls] = useState('');
  const [jobs, setJobs] = useState<ExtractionJob[]>([]);
  const [loading, setLoading] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load recent jobs on mount
  useEffect(() => {
    extractApi.listJobs().then(r => setJobs(r.data)).catch(() => {});
  }, []);

  // Poll running jobs
  useEffect(() => {
    const hasRunning = jobs.some(j => j.status === 'PENDING' || j.status === 'RUNNING');
    if (hasRunning && !pollingRef.current) {
      pollingRef.current = setInterval(async () => {
        const updated = await Promise.all(
          jobs.map(j =>
            j.status === 'PENDING' || j.status === 'RUNNING'
              ? extractApi.getJob(j.id).then(r => r.data)
              : Promise.resolve(j)
          )
        );
        setJobs(updated);
      }, 2000);
    } else if (!hasRunning && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; } };
  }, [jobs]);

  async function handleSubmit() {
    const lines = urls.split(/[\n\s,]+/).map(u => u.trim()).filter(u => u.startsWith('http'));
    if (!lines.length) return;
    setLoading(true);
    const newJobs: ExtractionJob[] = [];
    for (const url of lines) {
      try {
        const { data } = await extractApi.start(url);
        const job = await extractApi.getJob(data.jobId);
        newJobs.push(job.data);
      } catch (e: any) {
        newJobs.push({ id: 'err', paperUrl: url, status: 'FAILED', researchersFound: 0, error: e.response?.data?.error || e.message, createdAt: '', updatedAt: '' });
      }
    }
    setJobs(prev => [...newJobs, ...prev]);
    setUrls('');
    setLoading(false);
  }

  const statusColor = (s: string) => ({
    PENDING: 'bg-yellow-100 text-yellow-800',
    RUNNING: 'bg-blue-100 text-blue-800',
    DONE: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
  }[s] || 'bg-gray-100 text-gray-600');

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Extract Researchers</h1>
      <p className="text-sm text-gray-500 mb-6">Paste arXiv, OpenReview, or researcher profile URLs — one per line</p>

      <textarea
        value={urls}
        onChange={e => setUrls(e.target.value)}
        placeholder={"https://arxiv.org/abs/2401.00001\nhttps://arxiv.org/abs/2312.12345"}
        rows={5}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />

      <button
        onClick={handleSubmit}
        disabled={loading || !urls.trim()}
        className="mt-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium px-5 py-2 rounded-lg transition"
      >
        {loading ? 'Starting…' : 'Extract Researchers'}
      </button>

      {jobs.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Recent Extractions</h2>
          <div className="space-y-2">
            {jobs.map((job, i) => (
              <div key={job.id + i} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 truncate max-w-xs">{job.paperUrl}</p>
                  {job.error && <p className="text-xs text-red-500 mt-0.5">{job.error}</p>}
                </div>
                <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                  {job.status === 'DONE' && (
                    <span className="text-xs text-gray-500">{job.researchersFound} found</span>
                  )}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor(job.status)}`}>
                    {job.status === 'RUNNING' ? '⏳ Running' : job.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

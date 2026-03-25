import { useState } from 'react';
import axios from 'axios';

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const [serperKey, setSerperKey] = useState('');
  const [serperSaved, setSerperSaved] = useState(false);

  async function handleSave() {
    await axios.put('/api/settings/dashscope', { dashscopeKey: apiKey });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await axios.post('/api/settings/test-dashscope');
      setTestResult(res.data.ok ? '✓ API key is valid' : '✗ Key invalid');
    } catch (e: any) {
      setTestResult('✗ ' + (e.response?.data?.error || e.message));
    }
    setTesting(false);
  }

  async function handleSerperSave() {
    await axios.put('/api/settings/serper', { serperKey });
    setSerperSaved(true);
    setTimeout(() => setSerperSaved(false), 2000);
  }

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Settings</h1>

      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-4">
        <h2 className="text-base font-medium text-gray-800 mb-1">DashScope API Key</h2>
        <p className="text-sm text-gray-500 mb-4">
          Used for AI extraction via Qwen. Get your key at{' '}
          <a href="https://dashscope.aliyun.com" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
            dashscope.aliyun.com
          </a>
        </p>
        <input
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          type="password"
          placeholder="sk-…"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
        />
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={!apiKey}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40">
            {saved ? '✓ Saved' : 'Save'}
          </button>
          <button onClick={handleTest} disabled={testing || !apiKey}
            className="border border-gray-300 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-40">
            {testing ? 'Testing…' : 'Test'}
          </button>
        </div>
        {testResult && (
          <p className={`text-sm mt-3 ${testResult.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{testResult}</p>
        )}
      </div>

      {/* Serper API Key */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-4">
        <h2 className="text-base font-medium text-gray-800 mb-1">Serper API Key</h2>
        <p className="text-sm text-gray-500 mb-4">
          Used for Google Search to accurately find researcher profiles (LinkedIn, Google Scholar, GitHub, homepage).
          Free tier: 2,500 queries/month. Get your key at{' '}
          <a href="https://serper.dev" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
            serper.dev
          </a>
        </p>
        <input
          value={serperKey}
          onChange={e => setSerperKey(e.target.value)}
          type="password"
          placeholder="your-serper-api-key"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
        />
        <button onClick={handleSerperSave} disabled={!serperKey}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40">
          {serperSaved ? '✓ Saved' : 'Save'}
        </button>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm text-gray-500">
        <p className="font-medium text-gray-700 mb-2">Icebreaker Integration</p>
        <p>When pushing researchers to Icebreaker, you'll be prompted for:</p>
        <ul className="mt-2 space-y-1 list-disc list-inside">
          <li>
            Icebreaker <strong>backend</strong> API URL —{' '}
            <code className="bg-gray-100 px-1 rounded text-xs">http://localhost:3200</code>
            <span className="text-xs ml-1">(backend port, not the frontend 5300)</span>
          </li>
          <li>Icebreaker API key (to be added in Phase 2)</li>
          <li>Target Campaign ID</li>
        </ul>
      </div>
    </div>
  );
}

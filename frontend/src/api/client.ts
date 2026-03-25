import axios from 'axios';

const api = axios.create({ baseURL: '' }); // uses Vite proxy

export const researchersApi = {
  list: (params?: Record<string, any>) => api.get('/api/researchers', { params }),
  get: (id: string) => api.get(`/api/researchers/${id}`),
  create: (data: any) => api.post('/api/researchers', data),
  update: (id: string, data: any) => api.put(`/api/researchers/${id}`, data),
  delete: (id: string) => api.delete(`/api/researchers/${id}`),
  stats: () => api.get('/api/researchers/stats'),
  reEnrich: (ids?: string[]) => api.post('/api/researchers/re-enrich', { ids }),
};

export const extractApi = {
  start: (paperUrl: string, projectId?: string) => api.post('/api/extract', { paperUrl, projectId }),
  getJob: (jobId: string) => api.get(`/api/extract/jobs/${jobId}`),
  listJobs: () => api.get('/api/extract/jobs'),
};

export const projectsApi = {
  list: () => api.get('/api/projects'),
  get: (id: string) => api.get(`/api/projects/${id}`),
  create: (data: { name: string; description?: string }) => api.post('/api/projects', data),
  update: (id: string, data: { name?: string; description?: string }) => api.put(`/api/projects/${id}`, data),
  delete: (id: string) => api.delete(`/api/projects/${id}`),
  updatePoolName: (jobId: string, poolName: string) => api.patch(`/api/projects/pools/${jobId}`, { poolName }),
  getPoolResearchers: (jobId: string) => api.get(`/api/projects/pools/${jobId}/researchers`),
};

export const exportApi = {
  csv: (researcherIds?: string[]) =>
    api.post('/api/export/csv', { researcherIds }, { responseType: 'blob' }),
  push: (data: { researcherIds: string[]; icebreakerUrl: string; icebreakerApiKey: string; campaignId: string }) =>
    api.post('/api/export/push', data),
};

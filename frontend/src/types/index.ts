export interface Researcher {
  id: string;
  firstName?: string;
  lastName?: string;
  nameCN?: string;
  email?: string;
  currentOrg?: string;
  jobTitle?: string;
  team?: string;
  researchAreas?: string;   // JSON string
  seniority?: string;
  education?: string;
  previousCompanies?: string; // JSON string
  googleScholar?: string;
  github?: string;
  linkedin?: string;
  maimai?: string;
  openreview?: string;
  homepage?: string;
  contact?: string;
  status: string;
  priority: string;
  notes?: string;
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExtractionJob {
  id: string;
  projectId?: string;
  paperUrl: string;
  paperTitle?: string;
  poolName?: string;   // user-editable, defaults to paperTitle
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  researchersFound: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  poolCount: number;
  totalResearchers: number;
  jobs: ExtractionJob[];
  createdAt: string;
  updatedAt: string;
}

export interface ResearcherListResponse {
  researchers: Researcher[];
  total: number;
  page: number;
  limit: number;
}

export const STATUSES = ['未接触', '已联系', '合作中', '不适合'] as const;
export const PRIORITIES = ['高', '中', '低'] as const;
export const RESEARCH_TAGS = ['Infra', 'Architecture', 'Post-training', 'RL', 'Reasoning', 'Safety', 'Interpretability', 'Multimodal', 'Video Gen', 'Data', 'Evaluation'] as const;

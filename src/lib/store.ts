import { create } from "zustand";

interface Company {
  id: string;
  name: string;
  industry: string | null;
  description: string | null;
  targetMarket: string | null;
  mainGoal: string | null;
}

interface Source {
  id: string;
  publicId: number | null;
  content: string;
  hashtags: string[];
  aiClusters: string[];
  metadata?: unknown;
  createdAt: string;
  updatedAt: string;
}

interface ChecklistItem {
  id: string;
  publicId?: number | null;
  title: string;
  description: string | null;
  iceScore: number;
  status: string;
  hashtags: string[];
}

interface AppState {
  company: Company | null;
  sources: Source[];
  checklistItems: ChecklistItem[];
  isLoading: boolean;

  setCompany: (company: Company | null) => void;
  setSources: (sources: Source[]) => void;
  setChecklistItems: (items: ChecklistItem[]) => void;
  setLoading: (loading: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  company: null,
  sources: [],
  checklistItems: [],
  isLoading: false,

  setCompany: (company) => set({ company }),
  setSources: (sources) => set({ sources: Array.isArray(sources) ? sources : [] }),
  setChecklistItems: (checklistItems) => set({ checklistItems: Array.isArray(checklistItems) ? checklistItems : [] }),
  setLoading: (isLoading) => set({ isLoading }),
}));

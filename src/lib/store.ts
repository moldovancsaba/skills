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
  entityTag: string | null;
  aiClusters: string[];
  metadata?: unknown;
  createdAt: string;
  updatedAt: string;
}

interface NBAItem {
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
  nbaItems: NBAItem[];
  isLoading: boolean;

  setCompany: (company: Company | null) => void;
  setSources: (sources: Source[]) => void;
  setNbaItems: (items: NBAItem[]) => void;
  setLoading: (loading: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  company: null,
  sources: [],
  nbaItems: [],
  isLoading: false,

  setCompany: (company) => set({ company }),
  setSources: (sources) => set({ sources: Array.isArray(sources) ? sources : [] }),
  setNbaItems: (nbaItems) => set({ nbaItems: Array.isArray(nbaItems) ? nbaItems : [] }),
  setLoading: (isLoading) => set({ isLoading }),
}));


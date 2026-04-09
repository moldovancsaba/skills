import { create } from "zustand";

interface Company {
  id: string;
  name: string;
  industry: string | null;
  description: string | null;
  targetMarket: string | null;
  mainGoal: string | null;
}

interface Product {
  id: string;
  publicId: number | null;
  name: string;
  hashtags: string[];
  description: string | null;
  pricing: string | null;
  features: string[];
}

interface Customer {
  id: string;
  publicId: number | null;
  name: string;
  hashtags: string[];
  email: string | null;
  segments: string[];
  painPoints: string[];
  channels: string[];
}

interface Competitor {
  id: string;
  publicId: number | null;
  name: string;
  hashtags: string[];
  urls: string[];
  pricing: string | null;
  strengths: string[];
  weaknesses: string[];
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
  products: Product[];
  customers: Customer[];
  competitors: Competitor[];
  nbaItems: NBAItem[];
  isLoading: boolean;
  
  setCompany: (company: Company | null) => void;
  setProducts: (products: Product[]) => void;
  setCustomers: (customers: Customer[]) => void;
  setCompetitors: (competitors: Competitor[]) => void;
  setNbaItems: (items: NBAItem[]) => void;
  setLoading: (loading: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  company: null,
  products: [],
  customers: [],
  competitors: [],
  nbaItems: [],
  isLoading: false,
  
  setCompany: (company) => set({ company }),
  setProducts: (products) => set({ products }),
  setCustomers: (customers) => set({ customers }),
  setCompetitors: (competitors) => set({ competitors }),
  setNbaItems: (nbaItems) => set({ nbaItems }),
  setLoading: (isLoading) => set({ isLoading }),
}));

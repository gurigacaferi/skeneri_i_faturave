import { create } from 'zustand';

interface Expense {
  name: string;
  category: string;
  amount: number;
  date: string;
  merchant: string | null;
  vat_code: string;
  tvsh_percentage: number;
  nui: string | null;
  nr_fiskal: string | null;
  numri_i_tvsh_se: string | null;
  description: string;
  sasia: number;
  njesia: string;
}

interface ReceiptReviewState {
  receiptId: string | null; // Add receiptId to the store
  imageUrl: string | null;
  expenses: Expense[];
  setReviewData: (data: { receiptId?: string; imageUrl: string; expenses: Expense[] }) => void;
  clearReviewData: () => void;
}

export const useReceiptReviewStore = create<ReceiptReviewState>((set) => ({
  receiptId: null,
  imageUrl: null,
  expenses: [],
  setReviewData: (data) => set({ 
    receiptId: data.receiptId || null, 
    imageUrl: data.imageUrl, 
    expenses: data.expenses 
  }),
  clearReviewData: () => set({ receiptId: null, imageUrl: null, expenses: [] }),
}));
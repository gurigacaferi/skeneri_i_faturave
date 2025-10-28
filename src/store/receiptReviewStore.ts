import { create } from 'zustand';

interface ExpenseData {
  name: string;
  category: string;
  amount: number;
  date: string;
  merchant: string | null;
  vat_code: string | null;
  tvsh_percentage: number;
  nui: string | null;
  nr_fiskal: string | null;
  numri_i_tvsh_se: string | null;
  description: string | null;
  sasia: number | null;
  njesia: string | null;
}

interface ReceiptReviewState {
  receiptId: string | null;
  imageUrl: string | null;
  expenses: ExpenseData[];
  setReviewData: (data: { receiptId: string; imageUrl: string; expenses: ExpenseData[] }) => void;
  clearReviewData: () => void;
}

export const useReceiptReviewStore = create<ReceiptReviewState>((set) => ({
  receiptId: null,
  imageUrl: null,
  expenses: [],
  setReviewData: (data) => set(data),
  clearReviewData: () => set({ receiptId: null, imageUrl: null, expenses: [] }),
}));
export type Receipt = {
  id: string;
  user_id: string;
  filename: string;
  storage_path: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string;
  created_at: string;
  processed_at?: string;
};

export type Expense = {
  id: string;
  receipt_id: string;
  user_id: string;
  description: string;
  amount: number;
  category: string;
  page_number: number;
};
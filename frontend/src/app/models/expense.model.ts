export interface Expense {
  id?: number;
  user_id?: number;
  category_id: number;
  amount: number;
  description: string;
  date: string;
  created_at?: string;
  category_name?: string;
}

export interface ExpenseSummary {
  total_spent: number;
  month_spent: number;
  category_breakdown: {
    name: string;
    total: number;
    count: number;
  }[];
  recent_expenses?: any[];
}

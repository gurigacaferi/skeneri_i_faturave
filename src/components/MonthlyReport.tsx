import React, { useEffect, useState } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { showError } from '@/utils/toast';
import { Loader2 } from 'lucide-react';

interface Expense {
  id: string;
  category: string;
  amount: number;
  date: string;
}

interface MonthlySummary {
  month: string; // e.g., "October 2023"
  monthKey: string; // e.g., "2023-10"
  total: number;
  categories: { [key: string]: number };
}

const MonthlyReport: React.FC = () => {
  const { supabase, session } = useSession();
  const [monthlyReports, setMonthlyReports] = useState<MonthlySummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMonthlyReports = async () => {
    if (!session) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('expenses')
      .select('amount, category, date')
      .eq('user_id', session.user.id)
      .order('date', { ascending: false });

    if (error) {
      showError('Failed to fetch monthly reports: ' + error.message);
      console.error('Error fetching monthly reports:', error);
    } else {
      const reports = processExpensesIntoMonthlyReports(data || []);
      setMonthlyReports(reports);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMonthlyReports();
  }, [session]);

  const processExpensesIntoMonthlyReports = (expenses: Expense[]): MonthlySummary[] => {
    const monthlyMap: { [key: string]: MonthlySummary } = {};

    expenses.forEach(expense => {
      const date = new Date(expense.date);
      const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      const monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });

      if (!monthlyMap[monthKey]) {
        monthlyMap[monthKey] = { month: monthName, monthKey: monthKey, total: 0, categories: {} };
      }

      monthlyMap[monthKey].total += expense.amount;
      monthlyMap[monthKey].categories[expense.category] = (monthlyMap[monthKey].categories[expense.category] || 0) + expense.amount;
    });

    return Object.values(monthlyMap).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Monthly Expense Report</CardTitle>
        <CardDescription>A summary of your expenses by month and category.</CardDescription>
      </CardHeader>
      <CardContent>
        {monthlyReports.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400">No monthly reports available. Upload receipts to generate reports!</p>
        ) : (
          <div className="space-y-6">
            {monthlyReports.map((report) => (
              <Card key={report.monthKey} className="p-4">
                <h3 className="text-lg font-semibold mb-2">{report.month}</h3>
                <p className="text-md font-bold mb-4">Total: ${report.total.toFixed(2)}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {Object.entries(report.categories).map(([category, amount]) => (
                    <div key={category} className="flex justify-between text-sm text-gray-700 dark:text-gray-300">
                      <span>{category}:</span>
                      <span>${amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MonthlyReport;
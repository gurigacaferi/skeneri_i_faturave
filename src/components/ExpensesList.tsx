import React, { useEffect, useState } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Loader2, Trash2, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import EditExpenseDialog from './EditExpenseDialog';

interface Expense {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: string;
  merchant: string | null;
  tvsh_percentage: number;
  vat_code: string | null; // Allow vat_code to be null
  created_at: string;
}

const ExpensesList: React.FC = () => {
  const { supabase, session } = useSession();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [currentExpenseToEdit, setCurrentExpenseToEdit] = useState<Expense | null>(null);

  const fetchExpenses = async () => {
    if (!session) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('expenses')
      .select('id, name, category, amount, date, merchant, tvsh_percentage, vat_code, created_at') // Select vat_code
      .eq('user_id', session.user.id)
      .order('date', { ascending: false });

    if (error) {
      showError('Failed to fetch expenses: ' + error.message);
      console.error('Error fetching expenses:', error);
    } else {
      setExpenses(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchExpenses();
  }, [session]);

  const handleDeleteExpense = async (expenseId: string) => {
    if (!session) {
      showError('You must be logged in to delete expenses.');
      return;
    }

    setDeletingId(expenseId);
    const toastId = showLoading('Deleting expense...');

    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseId)
        .eq('user_id', session.user.id);

      if (error) {
        throw new Error(error.message);
      }

      showSuccess('Expense deleted successfully!');
      fetchExpenses();
    } catch (error: any) {
      showError('Failed to delete expense: ' + error.message);
      console.error('Error deleting expense:', error);
    } finally {
      dismissToast(toastId);
      setDeletingId(null);
    }
  };

  const handleEditClick = (expense: Expense) => {
    setCurrentExpenseToEdit(expense);
    setIsEditDialogOpen(true);
  };

  const handleExpenseUpdated = () => {
    fetchExpenses();
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
        <CardTitle>Your Expenses</CardTitle>
        <CardDescription>A list of all your tracked expenses.</CardDescription>
      </CardHeader>
      <CardContent>
        {expenses.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400">No expenses recorded yet. Upload a receipt to get started!</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">VAT Code</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell>{format(new Date(expense.date), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>{expense.merchant || 'N/A'}</TableCell>
                    <TableCell>{expense.name}</TableCell>
                    <TableCell>{expense.category}</TableCell>
                    <TableCell className="text-right">${expense.amount.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{expense.vat_code || 'N/A'}</TableCell> {/* Display vat_code with fallback */}
                    <TableCell className="text-center flex items-center justify-center space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-blue-500 hover:text-blue-700"
                        onClick={() => handleEditClick(expense)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will permanently delete the expense "{expense.name}".
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteExpense(expense.id)}
                              disabled={deletingId === expense.id}
                              className="bg-red-500 hover:bg-red-600 text-white"
                            >
                              {deletingId === expense.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                'Delete'
                              )}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      {currentExpenseToEdit && (
        <EditExpenseDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          expense={currentExpenseToEdit}
          onExpenseUpdated={handleExpenseUpdated}
        />
      )}
    </Card>
  );
};

export default ExpensesList;
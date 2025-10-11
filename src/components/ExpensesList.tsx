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
  vat_code: string | null;
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
      .select('id, name, category, amount, date, merchant, tvsh_percentage, vat_code, created_at')
      .eq('user_id', session.user.id)
      .order('date', { ascending: false });

    if (error) {
      showError('Failed to fetch expenses: ' + error.message);
    } else {
      setExpenses(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchExpenses();
  }, [session]);

  const handleDeleteExpense = async (expenseId: string) => {
    if (!session) return;

    setDeletingId(expenseId);
    const toastId = showLoading('Deleting expense...');

    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseId);

      if (error) throw new Error(error.message);

      showSuccess('Expense deleted successfully!');
      fetchExpenses();
    } catch (error: any) {
      showError('Failed to delete expense: ' + error.message);
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
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="w-full max-w-5xl mx-auto shadow-lg shadow-black/5 border-0">
      <CardHeader>
        <CardTitle className="text-2xl">Your Expenses</CardTitle>
        <CardDescription>A list of all your tracked expenses.</CardDescription>
      </CardHeader>
      <CardContent>
        {expenses.length === 0 ? (
          <div className="text-center py-12 text-foreground/60">
            <p>No expenses recorded yet.</p>
            <p className="text-sm">Upload a receipt to get started!</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                  <TableHead className="py-3 px-4">Date</TableHead>
                  <TableHead className="py-3 px-4">Merchant</TableHead>
                  <TableHead className="py-3 px-4">Item</TableHead>
                  <TableHead className="py-3 px-4">Category</TableHead>
                  <TableHead className="text-right py-3 px-4">Amount</TableHead>
                  <TableHead className="text-right py-3 px-4">VAT Code</TableHead>
                  <TableHead className="text-center py-3 px-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&_tr:last-child]:border-0">
                {expenses.map((expense, index) => (
                  <TableRow key={expense.id} className={`transition-colors hover:bg-accent ${index % 2 !== 0 ? 'bg-secondary/30' : 'bg-transparent'}`}>
                    <TableCell className="py-3 px-4">{format(new Date(expense.date), 'MMM dd, yyyy')}</TableCell>
                    <TableCell className="py-3 px-4">{expense.merchant || 'N/A'}</TableCell>
                    <TableCell className="py-3 px-4 font-medium">{expense.name}</TableCell>
                    <TableCell className="py-3 px-4 text-foreground/80">{expense.category}</TableCell>
                    <TableCell className="text-right py-3 px-4">${expense.amount.toFixed(2)}</TableCell>
                    <TableCell className="text-right py-3 px-4 text-foreground/80">{expense.vat_code || 'N/A'}</TableCell>
                    <TableCell className="py-3 px-4">
                      <div className="flex items-center justify-center space-x-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-foreground/60 hover:text-primary hover:bg-accent"
                          onClick={() => handleEditClick(expense)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-foreground/60 hover:text-destructive hover:bg-accent">
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
                                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
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
                      </div>
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
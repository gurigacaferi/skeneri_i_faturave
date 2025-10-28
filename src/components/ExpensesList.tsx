import React, { useEffect, useState, useCallback } from 'react';
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
import { Loader2, Trash2, Pencil, Filter, Download, Settings } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import EditExpenseDialog from './EditExpenseDialog';
import { DateRangeFilter } from './DateRangeFilter';
import { exportExpensesToCsv, DEFAULT_EXPORT_COLUMNS } from '@/utils/exportToCsv';
import { useDebounce } from '@/hooks/useDebounce';
import { Checkbox } from '@/components/ui/checkbox';
import ExportSettingsModal from './ExportSettingsModal';

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
  nui: string | null;
  nr_fiskal: string | null;
  numri_i_tvsh_se: string | null;
  description: string | null;
  sasia: number | null; // NEW FIELD
  njesia: string | null; // NEW FIELD
  receipt_id: string | null; // ADDED FIELD
}

interface ExpensesListProps {
  refreshTrigger: number;
}

const ExpensesList: React.FC<ExpensesListProps> = ({ refreshTrigger }) => {
  const { supabase, session, profile, refreshProfile } = useSession();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentExpenseToEdit, setCurrentExpenseToEdit] = useState<Expense | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  // State for selection
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set());

  // State for filter inputs (updates immediately)
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined; label: string }>({
    from: undefined,
    to: undefined,
    label: "custom",
  });
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Debounced values for API calls (update after 500ms of inactivity)
  const debouncedMinAmount = useDebounce(minAmount, 500);
  const debouncedMaxAmount = useDebounce(maxAmount, 500);
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  // Determine which columns to fetch from the database
  const selectColumns = 'id, name, category, amount, date, merchant, tvsh_percentage, vat_code, created_at, nui, nr_fiskal, numri_i_tvsh_se, description, sasia, njesia, receipt_id';

  // Effect for fetching data, now depends on debounced values
  useEffect(() => {
    const fetchExpenses = async () => {
      if (!session) return;

      setLoading(true);
      let query = supabase
        .from('expenses')
        .select(selectColumns)
        .eq('user_id', session.user.id);

      // Apply filters using debounced values
      if (dateRange.from) {
        query = query.gte('date', format(dateRange.from, 'yyyy-MM-dd'));
      }
      if (dateRange.to) {
        query = query.lte('date', format(dateRange.to, 'yyyy-MM-dd'));
      }
      if (debouncedMinAmount) {
        query = query.gte('amount', parseFloat(debouncedMinAmount));
      }
      if (debouncedMaxAmount) {
        query = query.lte('amount', parseFloat(debouncedMaxAmount));
      }
      if (debouncedSearchTerm) {
        const searchLower = `%${debouncedSearchTerm.toLowerCase()}%`;
        query = query.or(`name.ilike.${searchLower},merchant.ilike.${searchLower},category.ilike.${searchLower}`);
      }

      const { data, error } = await query.order('date', { ascending: false });

      if (error) {
        showError('Failed to fetch expenses: ' + error.message);
      } else {
        setExpenses(data || []);
        // Clear selection when data refreshes
        setSelectedExpenseIds(new Set());
      }
      setLoading(false);
    };

    fetchExpenses();
  }, [
    session,
    supabase,
    dateRange,
    debouncedMinAmount,
    debouncedMaxAmount,
    debouncedSearchTerm,
    refreshTrigger,
  ]);

  const handleClearFilters = () => {
    setDateRange({ from: undefined, to: undefined, label: "custom" });
    setMinAmount('');
    setMaxAmount('');
    setSearchTerm('');
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!session) return;
    setDeletingId(expenseId);
    const toastId = showLoading('Deleting expense...');
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
      if (error) throw new Error(error.message);
      
      // INSTANT UI UPDATE: Remove the expense from the local state
      setExpenses(prevExpenses => prevExpenses.filter(exp => exp.id !== expenseId));
      setSelectedExpenseIds(prevIds => {
        const newSet = new Set(prevIds);
        newSet.delete(expenseId);
        return newSet;
      });

      showSuccess('Expense deleted successfully!');
    } catch (error: any) {
      showError('Failed to delete expense: ' + error.message);
    } finally {
      dismissToast(toastId);
      setDeletingId(null);
    }
  };

  const handleBulkDeleteExpenses = async () => {
    if (!session || selectedExpenseIds.size === 0) return;

    const idsToDelete = Array.from(selectedExpenseIds);
    const toastId = showLoading(`Deleting ${idsToDelete.length} expenses...`);

    try {
      // Use the .in() filter for efficient bulk deletion
      const { error } = await supabase
        .from('expenses')
        .delete()
        .in('id', idsToDelete);

      if (error) throw new Error(error.message);

      // Update local state: filter out all deleted IDs
      setExpenses(prevExpenses => prevExpenses.filter(exp => !selectedExpenseIds.has(exp.id)));
      
      // Clear the selection
      setSelectedExpenseIds(new Set());

      showSuccess(`${idsToDelete.length} expenses deleted successfully!`);
    } catch (error: any) {
      showError('Failed to delete selected expenses: ' + error.message);
    } finally {
      dismissToast(toastId);
    }
  };

  const handleEditClick = (expense: Expense) => {
    setCurrentExpenseToEdit(expense);
    setIsEditDialogOpen(true);
  };

  // Get the user's preferred columns, or use the default list
  const getExportColumns = () => {
    return profile?.csv_export_columns && profile.csv_export_columns.length > 0
      ? profile.csv_export_columns
      : DEFAULT_EXPORT_COLUMNS;
  };

  const handleExportFilteredExpenses = () => {
    if (expenses.length === 0) {
      showError('No expenses to export with current filters.');
      return;
    }
    setIsExporting(true);
    const fileName = `Filtered_Expenses_${dateRange.label.replace(/\s/g, '_')}_${format(new Date(), 'yyyyMMdd')}`;
    
    const columns = getExportColumns();
    exportExpensesToCsv(expenses, fileName, columns);
    
    showSuccess('Filtered expenses exported successfully!');
    setIsExporting(false);
  };

  const handleToggleSelect = (expenseId: string) => {
    setSelectedExpenseIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(expenseId)) {
        newSet.delete(expenseId);
      } else {
        newSet.add(expenseId);
      }
      return newSet;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedExpenseIds.size === expenses.length) {
      setSelectedExpenseIds(new Set());
    } else {
      setSelectedExpenseIds(new Set(expenses.map(exp => exp.id)));
    }
  };

  const handleExportSelectedExpenses = () => {
    if (selectedExpenseIds.size === 0) {
      showError('Please select at least one expense to export.');
      return;
    }

    setIsExporting(true);
    const selectedExpenses = expenses.filter(exp => selectedExpenseIds.has(exp.id));
    const fileName = `Selected_Expenses_${format(new Date(), 'yyyyMMdd_HHmmss')}`;
    
    const columns = getExportColumns();
    exportExpensesToCsv(selectedExpenses, fileName, columns);
    
    showSuccess(`${selectedExpenses.length} expenses exported successfully!`);
    setIsExporting(false);
  };

  const isAllSelected = expenses.length > 0 && selectedExpenseIds.size === expenses.length;
  const isIndeterminate = selectedExpenseIds.size > 0 && selectedExpenseIds.size < expenses.length;

  return (
    <>
      <Card className="w-full max-w-5xl mx-auto shadow-lg shadow-black/5 border-0">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-2xl">Your Expenses</CardTitle>
              <CardDescription>A list of all your tracked expenses.</CardDescription>
            </div>
            <Button variant="outline" size="icon" onClick={() => setIsSettingsOpen(true)} title="Export Settings">
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 border rounded-lg bg-secondary/30">
            <div className="col-span-full flex items-center gap-2 text-lg font-semibold text-foreground/80">
              <Filter className="h-5 w-5" /> Filters
            </div>
            <div className="col-span-full sm:col-span-2 md:col-span-1">
              <Label htmlFor="date-filter">Date Range</Label>
              <DateRangeFilter onDateRangeChange={setDateRange} initialRange={dateRange} />
            </div>
            <div className="col-span-full sm:col-span-2 md:col-span-1">
              <Label htmlFor="min-amount">Min Amount</Label>
              <Input
                id="min-amount"
                type="number"
                step="0.01"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                placeholder="e.g., 10.00"
              />
            </div>
            <div className="col-span-full sm:col-span-2 md:col-span-1">
              <Label htmlFor="max-amount">Max Amount</Label>
              <Input
                id="max-amount"
                type="number"
                step="0.01"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                placeholder="e.g., 100.00"
              />
            </div>
            <div className="col-span-full sm:col-span-2 md:col-span-1">
              <Label htmlFor="search-term">Search</Label>
              <Input
                id="search-term"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Name, merchant, category..."
              />
            </div>
            <div className="col-span-full flex justify-end gap-2 mt-2">
              <Button variant="outline" onClick={handleClearFilters}>
                Clear Filters
              </Button>
              
              {/* Bulk Delete Button */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="destructive" 
                    disabled={selectedExpenseIds.size === 0}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> 
                    Delete Selected ({selectedExpenseIds.size})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Bulk Deletion</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you absolutely sure you want to delete {selectedExpenseIds.size} selected expenses? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={handleBulkDeleteExpenses}
                      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    >
                      Yes, Delete All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button 
                onClick={handleExportSelectedExpenses} 
                disabled={isExporting || selectedExpenseIds.size === 0}
                variant="default"
              >
                {isExporting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Exporting...</>
                ) : (
                  <><Download className="mr-2 h-4 w-4" /> Export Selected ({selectedExpenseIds.size})</>
                )}
              </Button>
              <Button onClick={handleExportFilteredExpenses} disabled={isExporting || expenses.length === 0} variant="secondary">
                <Download className="mr-2 h-4 w-4" /> Export All Filtered
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-12 text-foreground/60">
              <p>No expenses recorded yet or no expenses match your current filters.</p>
              <p className="text-sm">Try adjusting your filters or upload a receipt to get started!</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                    <TableHead className="py-3 px-4 w-[50px] text-center">
                      <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={handleToggleSelectAll}
                        aria-label="Select all"
                        className={isIndeterminate ? 'border-primary bg-primary text-primary-foreground' : ''}
                      />
                    </TableHead>
                    <TableHead className="py-3 px-4">Date</TableHead>
                    <TableHead className="py-3 px-4">Merchant</TableHead>
                    <TableHead className="py-3 px-4">Item</TableHead>
                    <TableHead className="py-3 px-4">Category</TableHead>
                    <TableHead className="py-3 px-4">Sasia</TableHead> {/* NEW HEADER */}
                    <TableHead className="py-3 px-4">Njesia</TableHead> {/* NEW HEADER */}
                    <TableHead className="text-right py-3 px-4">Amount</TableHead>
                    <TableHead className="text-right py-3 px-4">VAT Code</TableHead>
                    <TableHead className="text-center py-3 px-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_tr:last-child]:border-0">
                  {expenses.map((expense, index) => (
                    <TableRow key={expense.id} className={`transition-colors hover:bg-accent ${index % 2 !== 0 ? 'bg-secondary/30' : 'bg-transparent'}`}>
                      <TableCell className="py-3 px-4 w-[50px] text-center">
                        <Checkbox
                          checked={selectedExpenseIds.has(expense.id)}
                          onCheckedChange={() => handleToggleSelect(expense.id)}
                          aria-label={`Select expense ${expense.name}`}
                        />
                      </TableCell>
                      <TableCell className="py-3 px-4">{format(new Date(expense.date), 'MMM dd, yyyy')}</TableCell>
                      <TableCell className="py-3 px-4">{expense.merchant || 'N/A'}</TableCell>
                      <TableCell className="py-3 px-4 font-medium">{expense.name}</TableCell>
                      <TableCell className="py-3 px-4 text-foreground/80">{expense.category}</TableCell>
                      <TableCell className="py-3 px-4">{expense.sasia || 'N/A'}</TableCell> {/* NEW CELL */}
                      <TableCell className="py-3 px-4">{expense.njesia || 'N/A'}</TableCell> {/* NEW CELL */}
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
            onExpenseUpdated={() => {
              // Trigger a refresh by incrementing the trigger state if needed, 
              // but for now, we rely on the component re-rendering after dialog closes.
            }}
          />
        )}
      </Card>
      <ExportSettingsModal
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        onSettingsSaved={refreshProfile}
      />
    </>
  );
};

export default ExpensesList;
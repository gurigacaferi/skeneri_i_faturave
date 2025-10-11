import React, { useState, useEffect } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Loader2, PlusCircle, Trash2, Split } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from '@radix-ui/react-icons';
import { format, parseISO } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid'; // For generating temporary IDs

interface ExpenseItem {
  tempId: string; // Temporary ID for UI management
  receiptId: string; // Link to the original receipt
  name: string;
  category: string;
  amount: number;
  date: Date;
  merchant: string | null;
  tvsh_percentage: number;
  vat_code: string; // Added new vat_code field
}

// Define the structure for initial expenses coming into the dialog
interface InitialExpenseData {
  receiptId: string;
  expense: {
    name: string;
    category: string;
    amount: number;
    date: string; // Date as string from AI
    merchant: string | null;
    tvsh_percentage: number;
    vat_code: string;
  };
}

interface ExpenseSplitterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialExpenses: InitialExpenseData[] | null; // Now an array of objects with receiptId
  batchId: string | null;
  onExpensesSaved: () => void;
}

const expenseCategories = {
  "660 Shpenzime te personelit": [
    "660-01 Paga bruto",
    "660-02 Sigurimi shendetesor",
    "660-03 Kontributi pensional",
  ],
  "665 Shpenzimet e zyres": [
    "665-01 Shpenzimet e qirase",
    "665-02 Material harxhues",
    "665-03 Pastrimi",
    "665-04 Ushqim dhe pije",
    "665-05 Shpenzime te IT-se",
    "665-06 Shpenzimt e perfaqesimit",
    "665-07 Asete nen 1000 euro",
    "665-09 Te tjera",
  ],
  "667 Sherbimet profesionale": [
    "667-01 Sherbimet e kontabilitetit",
    "667-02 Sherbime ligjore",
    "667-03 Sherbime konsulente",
    "667-04 Sherbime auditimi",
  ],
  "668 Shpenzimet e udhetimit": [
    "668-01 Akomodimi",
    "668-02 Meditja",
    "668-03 Transporti",
  ],
  "669 Shpenzimet e automjetit": [
    "669-01 Shpenzimet e karburantit",
    "669-02 Mirembajtje dhe riparim",
  ],
  "675 Shpenzimet e komunikimit": [
    "675-01 Interneti",
    "675-02 Telefon mobil",
    "675-03 Dergesa postare",
    "675-04 Telefon fiks",
  ],
  "683 Shpenzimet e sigurimit": [
    "683-01 Sigurimi i automjeteve",
    "683-02 Sigurimi i nderteses",
  ],
  "686 Komunalite": [
    "686-01 Energjia elektrike",
    "686-02 Ujesjellesi",
    "686-03 Pastrimi",
    "686-04 Shpenzimet e ngrohjes",
  ],
  "690 Shpenzime tjera operative": [
    "690-01 Shpenzimet e anetaresimit",
    "690-02 Shpenzimet e perkthimit",
    "690-03 Provizion bankar",
    "690-04 Mirembajtje e webfaqes",
    "690-05 Taksa komunale",
    "690-06 Mirembajtje e llogarise bankare",
  ],
};

const allSubcategories = Object.values(expenseCategories).flat();

// New VAT codes from user's request
const vatCodes = [
  "[31] Blerjet dhe importet pa TVSH",
  "[32] Blerjet dhe importet investive pa TVSH",
  "[33] Blerjet dhe importet me TVSH jo të zbritshme",
  "[34] Blerjet dhe importet investive me TVSH jo të zbritshme",
  "[35] Importet 18%",
  "[37] Importet 8%",
  "[39] Importet investive 18%",
  "[41] Importet investive 8%",
  "[43] Blerjet vendore 18%",
  "No VAT",
  "[45] Blerjet vendore 8%",
  "[47] Blerjet investive vendore 18%",
  "[49] Blerjet investive vendore 8%",
  "[65] E drejta e kreditimit të TVSH-së në lidhje me Ngarkesën e Kundërt 18%",
  "[28] Blerjet që i nënshtrohen ngarkesës së kundërt 18%",
];

// Helper to extract numeric percentage from the descriptive VAT code
const getPercentageFromVatCode = (vatCode: string): number => {
  if (vatCode === "No VAT" || vatCode.includes("pa TVSH") || vatCode.includes("jo të zbritshme")) {
    return 0;
  }
  const match = vatCode.match(/(\d+)%/);
  return match ? parseInt(match[1], 10) : 0;
};

const ExpenseSplitterDialog: React.FC<ExpenseSplitterDialogProps> = ({
  open,
  onOpenChange,
  initialExpenses,
  batchId,
  onExpensesSaved,
}) => {
  const { supabase, session } = useSession();
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && initialExpenses) {
      const parsedExpenses: ExpenseItem[] = initialExpenses.map((data) => ({
        tempId: uuidv4(),
        receiptId: data.receiptId, // Assign the receiptId
        name: data.expense.name,
        category: data.expense.category,
        amount: parseFloat(data.expense.amount.toFixed(2)),
        date: data.expense.date ? parseISO(data.expense.date) : new Date(),
        merchant: data.expense.merchant,
        vat_code: data.expense.vat_code || 'No VAT',
        tvsh_percentage: getPercentageFromVatCode(data.expense.vat_code || 'No VAT'),
      }));
      setExpenses(parsedExpenses.length > 0 ? parsedExpenses : [createNewEmptyExpense()]);
    } else if (open && !initialExpenses) {
      setExpenses([createNewEmptyExpense()]);
    }
  }, [open, initialExpenses]);

  const createNewEmptyExpense = (baseExpense?: Partial<ExpenseItem>): ExpenseItem => ({
    tempId: uuidv4(),
    receiptId: baseExpense?.receiptId || 'unknown', // Default to 'unknown' or handle as needed
    name: baseExpense?.name || '',
    category: baseExpense?.category || allSubcategories[0] || '',
    amount: baseExpense?.amount || 0,
    date: baseExpense?.date || new Date(),
    merchant: baseExpense?.merchant || null,
    vat_code: baseExpense?.vat_code || 'No VAT', // Default to 'No VAT'
    tvsh_percentage: getPercentageFromVatCode(baseExpense?.vat_code || 'No VAT'), // Derived
  });

  const handleAddExpense = () => {
    setExpenses((prev) => [...prev, createNewEmptyExpense()]);
  };

  const handleUpdateExpense = (tempId: string, field: keyof ExpenseItem, value: any) => {
    setExpenses((prev) =>
      prev.map((exp) => {
        if (exp.tempId === tempId) {
          const updatedExp = { ...exp, [field]: value };
          // If vat_code changes, update tvsh_percentage
          if (field === 'vat_code') {
            updatedExp.tvsh_percentage = getPercentageFromVatCode(value);
          }
          return updatedExp;
        }
        return exp;
      })
    );
  };

  const handleDeleteExpense = (tempId: string) => {
    setExpenses((prev) => prev.filter((exp) => exp.tempId !== tempId));
  };

  const handleSplitExpense = (tempId: string) => {
    const expenseToSplit = expenses.find((exp) => exp.tempId === tempId);
    if (expenseToSplit) {
      const newExpense1 = createNewEmptyExpense({ ...expenseToSplit, tempId: uuidv4(), amount: expenseToSplit.amount / 2 });
      const newExpense2 = createNewEmptyExpense({ ...expenseToSplit, tempId: uuidv4(), amount: expenseToSplit.amount / 2 });

      setExpenses((prev) => {
        const index = prev.findIndex((exp) => exp.tempId === tempId);
        if (index > -1) {
          return [...prev.slice(0, index), newExpense1, newExpense2, ...prev.slice(index + 1)];
        }
        return prev;
      });
    }
  };

  const validateExpenses = (): boolean => {
    if (expenses.length === 0) {
      showError('Please add at least one expense item.');
      return false;
    }

    for (const exp of expenses) {
      if (!exp.name.trim()) {
        showError(`Expense name cannot be empty for item ${exp.tempId}.`);
        return false;
      }
      if (!exp.category || !allSubcategories.includes(exp.category)) {
        showError(`Invalid category for item ${exp.tempId}. Please select a valid sub-category.`);
        return false;
      }
      if (exp.amount <= 0) {
        showError(`Amount must be greater than 0 for item ${exp.tempId}.`);
        return false;
      }
      if (!exp.date) {
        showError(`Date is required for item ${exp.tempId}.`);
        return false;
      }
      if (!exp.vat_code || !vatCodes.includes(exp.vat_code)) {
        showError(`Invalid VAT code for item ${exp.tempId}.`);
        return false;
      }
      // tvsh_percentage is derived, so no direct validation needed here beyond what getPercentageFromVatCode handles
    }
    return true;
  };

  const handleSaveAllExpenses = async () => {
    if (!validateExpenses()) {
      return;
    }

    if (!session || !batchId) {
      showError('Authentication or batch ID is missing. Please log in and ensure a batch is selected.');
      return;
    }

    setLoading(true);
    const toastId = showLoading('Saving expenses...');

    try {
      const expensesToInsert = expenses.map((exp) => ({
        user_id: session.user.id,
        receipt_id: exp.receiptId, // Use the receiptId from the expense item
        batch_id: batchId,
        name: exp.name.trim(),
        category: exp.category,
        amount: exp.amount,
        date: format(exp.date, 'yyyy-MM-dd'),
        merchant: exp.merchant?.trim() || null,
        vat_code: exp.vat_code, // Save the descriptive VAT code
        tvsh_percentage: exp.tvsh_percentage, // Save the derived numeric percentage
      }));

      const { error: expensesError } = await supabase
        .from('expenses')
        .insert(expensesToInsert);

      if (expensesError) {
        throw new Error(expensesError.message);
      }

      // Update total_amount for the batch
      const totalBatchAmount = expensesToInsert.reduce((sum, expense) => sum + expense.amount, 0);
      const { data: currentBatch, error: fetchBatchError } = await supabase
        .from('expense_batches')
        .select('total_amount')
        .eq('id', batchId)
        .single();

      if (fetchBatchError) {
        console.error('Error fetching current batch amount:', fetchBatchError.message);
        // Proceed without updating total if fetch fails, but log it
      } else {
        const newTotalAmount = (currentBatch?.total_amount || 0) + totalBatchAmount;
        const { error: updateBatchError } = await supabase
          .from('expense_batches')
          .update({ total_amount: newTotalAmount })
          .eq('id', batchId);

        if (updateBatchError) {
          console.error('Error updating batch total amount:', updateBatchError.message);
        }
      }

      showSuccess('Expenses saved successfully!');
      onExpensesSaved();
      onOpenChange(false);
    } catch (error: any) {
      showError('Failed to save expenses: ' + error.message);
      console.error('Error saving expenses:', error);
    } finally {
      dismissToast(toastId);
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review and Split Expenses</DialogTitle>
          <DialogDescription>
            Review the extracted expenses. You can edit, add, delete, or split items before saving.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {expenses.length === 0 && (
            <p className="text-center text-gray-500 dark:text-gray-400">No expenses to display. Click "Add Expense" to start.</p>
          )}
          {expenses.map((exp, index) => (
            <div key={exp.tempId} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center border-b pb-4 mb-4 last:border-b-0 last:pb-0">
              <div className="col-span-12 text-sm font-semibold text-gray-700 dark:text-gray-300">
                Expense #{index + 1} (Receipt ID: {exp.receiptId.substring(0, 8)}...)
              </div>
              <div className="col-span-6 md:col-span-3">
                <Label htmlFor={`name-${exp.tempId}`}>Name</Label>
                <Input
                  id={`name-${exp.tempId}`}
                  value={exp.name}
                  onChange={(e) => handleUpdateExpense(exp.tempId, 'name', e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="col-span-6 md:col-span-3">
                <Label htmlFor={`category-${exp.tempId}`}>Category</Label>
                <Select
                  onValueChange={(value) => handleUpdateExpense(exp.tempId, 'category', value)}
                  value={exp.category}
                  disabled={loading}
                >
                  <SelectTrigger id={`category-${exp.tempId}`}>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(expenseCategories).map(([mainCategory, subcategories]) => (
                      <SelectGroup key={mainCategory}>
                        <SelectLabel>{mainCategory}</SelectLabel>
                        {subcategories.map((subCategory) => (
                          <SelectItem key={subCategory} value={subCategory}>
                            {subCategory}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-6 md:col-span-2">
                <Label htmlFor={`amount-${exp.tempId}`}>Amount</Label>
                <Input
                  id={`amount-${exp.tempId}`}
                  type="number"
                  step="0.01"
                  value={exp.amount}
                  onChange={(e) => handleUpdateExpense(exp.tempId, 'amount', parseFloat(e.target.value) || 0)}
                  disabled={loading}
                />
              </div>
              <div className="col-span-6 md:col-span-2">
                <Label htmlFor={`vat_code-${exp.tempId}`}>VAT Code</Label>
                <Select
                  onValueChange={(value) => handleUpdateExpense(exp.tempId, 'vat_code', value)}
                  value={exp.vat_code}
                  disabled={loading}
                >
                  <SelectTrigger id={`vat_code-${exp.tempId}`}>
                    <SelectValue placeholder="Select VAT code" />
                  </SelectTrigger>
                  <SelectContent>
                    {vatCodes.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-6 md:col-span-2">
                <Label htmlFor={`date-${exp.tempId}`}>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={'outline'}
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !exp.date && 'text-muted-foreground'
                      )}
                      disabled={loading}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {exp.date ? format(exp.date, 'PPP') : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={exp.date}
                      onSelect={(date) => handleUpdateExpense(exp.tempId, 'date', date!)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="col-span-6 md:col-span-3">
                <Label htmlFor={`merchant-${exp.tempId}`}>Merchant</Label>
                <Input
                  id={`merchant-${exp.tempId}`}
                  value={exp.merchant || ''}
                  onChange={(e) => handleUpdateExpense(exp.tempId, 'merchant', e.target.value || null)}
                  disabled={loading}
                />
              </div>
              <div className="col-span-12 md:col-span-3 flex items-end justify-end space-x-2 mt-4 md:mt-0">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleSplitExpense(exp.tempId)}
                  disabled={loading}
                  title="Split Expense"
                >
                  <Split className="h-4 w-4" />
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => handleDeleteExpense(exp.tempId)}
                  disabled={loading}
                  title="Delete Expense"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button onClick={handleAddExpense} variant="secondary" className="mt-4" disabled={loading}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Expense Item
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSaveAllExpenses} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save All Expenses'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExpenseSplitterDialog;
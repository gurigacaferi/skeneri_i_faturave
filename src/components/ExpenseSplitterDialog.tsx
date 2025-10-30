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
import { Loader2, PlusCircle, Trash2, Split, ChevronLeft, ChevronRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from '@radix-ui/react-icons';
import { format, parseISO } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { NJESIA_OPTIONS } from '@/lib/constants'; // Import constants
import ReceiptViewer from './ReceiptViewer';

interface ExpenseItem {
  tempId: string;
  receiptId: string;
  name: string;
  category: string;
  amount: number;
  date: Date;
  merchant: string | null;
  tvsh_percentage: number;
  vat_code: string;
  nui: string | null;
  nr_fiskal: string | null;
  numri_i_tvsh_se: string | null;
  description: string | null;
  sasia: number | null; // NEW FIELD
  njesia: string | null; // NEW FIELD
}

interface InitialExpenseData {
  receiptId: string;
  expense: {
    name: string;
    category: string;
    amount: number;
    date: string;
    merchant: string | null;
    tvsh_percentage: number;
    vat_code: string;
    nui: string | null;
    nr_fiskal: string | null;
    numri_i_tvsh_se: string | null;
    description: string | null;
  };
}

interface ExpenseSplitterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialExpenses: InitialExpenseData[] | null;
  batchId: string | null;
  onExpensesSaved: () => void;
  isConnectedToQuickBooks: boolean;
}

const expenseCategories = {
  "660 Shpenzime te personelit": ["660-01 Paga bruto", "660-02 Sigurimi shendetesor", "660-03 Kontributi pensional"],
  "665 Shpenzimet e zyres": ["665-01 Shpenzimet e qirase", "665-02 Material harxhues", "665-03 Pastrimi", "665-04 Ushqim dhe pije", "665-05 Shpenzime te IT-se", "665-06 Shpenzimt e perfaqesimit", "665-07 Asete nen 1000 euro", "665-09 Te tjera"],
  "667 Sherbimet profesionale": ["667-01 Sherbimet e kontabilitetit", "667-02 Sherbime ligjore", "667-03 Sherbime konsulente", "667-04 Sherbime auditimi"],
  "668 Shpenzimet e udhetimit": ["668-01 Akomodimi", "668-02 Meditja", "668-03 Transporti"],
  "669 Shpenzimet e automjetit": ["669-01 Shpenzimet e karburantit", "669-02 Mirembajtje dhe riparim"],
  "675 Shpenzimet e komunikimit": ["675-01 Interneti", "675-02 Telefon mobil", "675-03 Dergesa postare", "675-04 Telefon fiks"],
  "683 Shpenzimet e sigurimit": ["683-01 Sigurimi i automjeteve", "683-02 Sigurimi i nderteses"],
  "686 Komunalite": ["686-01 Energjia elektrike", "686-02 Ujesjellesi", "686-03 Pastrimi", "686-04 Shpenzimet e ngrohjes"],
  "690 Shpenzime tjera operative": ["690-01 Shpenzimet e anetaresimit", "690-02 Shpenzimet e perkthimit", "690-03 Provizion bankar", "690-04 Mirembajtje e webfaqes", "690-05 Taksa komunale", "690-06 Mirembajtje e llogarise bankare", "690-09 Te tjera"],
};

const allSubcategories = Object.values(expenseCategories).flat();

const vatCodes = [
  "[31] Blerjet dhe importet pa TVSH", "[32] Blerjet dhe importet investive pa TVSH", "[33] Blerjet dhe importet me TVSH jo të zbritshme", "[34] Blerjet dhe importet investive me TVSH jo të zbritshme", "[35] Importet 18%", "[37] Importet 8%", "[39] Importet investive 18%", "[41] Importet investive 8%", "[43] Blerjet vendore 18%", "No VAT", "[45] Blerjet vendore 8%", "[47] Blerjet investive vendore 18%", "[49] Blerjet investive vendore 8%", "[65] E drejta e kreditimit të TVSH-së në lidhje me Ngarkesën e Kundërt 18%", "[28] Blerjet që i nënshtrohen ngarkesës së kundërt 18%",
];

const getPercentageFromVatCode = (vatCode: string): number => {
  if (vatCode === "No VAT" || vatCode.includes("pa TVSH") || vatCode.includes("jo të zbritshme")) return 0;
  const match = vatCode.match(/(\d+)%/);
  return match ? parseInt(match[1], 10) : 0;
};

const ExpenseSplitterDialog: React.FC<ExpenseSplitterDialogProps> = ({
  open, onOpenChange, initialExpenses, batchId, onExpensesSaved,
}) => {
  const { supabase, session } = useSession();
  const [receiptsData, setReceiptsData] = useState<Map<string, ExpenseItem[]>>(new Map());
  const [orderedReceiptIds, setOrderedReceiptIds] = useState<string[]>([]);
  const [currentReceiptIndex, setCurrentReceiptIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && initialExpenses && initialExpenses.length > 0) {
      const grouped = initialExpenses.reduce((acc, data) => {
        const item: ExpenseItem = {
          tempId: uuidv4(),
          receiptId: data.receiptId,
          name: data.expense.name,
          category: data.expense.category,
          amount: parseFloat(data.expense.amount.toFixed(2)),
          date: data.expense.date ? parseISO(data.expense.date) : new Date(),
          merchant: data.expense.merchant,
          vat_code: data.expense.vat_code || 'No VAT',
          tvsh_percentage: getPercentageFromVatCode(data.expense.vat_code || 'No VAT'),
          nui: data.expense.nui,
          nr_fiskal: data.expense.nr_fiskal,
          numri_i_tvsh_se: data.expense.numri_i_tvsh_se,
          description: data.expense.description,
          sasia: 1,
          njesia: NJESIA_OPTIONS[0] || 'cope',
        };
        const items = acc.get(data.receiptId) || [];
        items.push(item);
        acc.set(data.receiptId, items);
        return acc;
      }, new Map<string, ExpenseItem[]>());

      setReceiptsData(grouped);
      setOrderedReceiptIds(Array.from(grouped.keys()));
      setCurrentReceiptIndex(0);
    } else if (open) {
      setReceiptsData(new Map());
      setOrderedReceiptIds([]);
      setCurrentReceiptIndex(0);
    }
  }, [open, initialExpenses]);

  const currentReceiptId = orderedReceiptIds.length > 0 ? orderedReceiptIds[currentReceiptIndex] : null;
  const currentExpenses = currentReceiptId ? receiptsData.get(currentReceiptId) || [] : [];

  const createNewEmptyExpense = (receiptId: string, baseExpense?: Partial<ExpenseItem>): ExpenseItem => ({
    tempId: uuidv4(),
    receiptId: receiptId,
    name: baseExpense?.name || '',
    category: baseExpense?.category || allSubcategories[0] || '',
    amount: baseExpense?.amount || 0,
    date: baseExpense?.date || new Date(),
    merchant: baseExpense?.merchant || null,
    vat_code: baseExpense?.vat_code || 'No VAT',
    tvsh_percentage: getPercentageFromVatCode(baseExpense?.vat_code || 'No VAT'),
    nui: baseExpense?.nui || null,
    nr_fiskal: baseExpense?.nr_fiskal || null,
    numri_i_tvsh_se: baseExpense?.numri_i_tvsh_se || null,
    description: baseExpense?.description || null,
    sasia: baseExpense?.sasia || 1,
    njesia: baseExpense?.njesia || NJESIA_OPTIONS[0] || 'cope',
  });

  const handleAddExpense = () => {
    if (!currentReceiptId) return;
    setReceiptsData(prevData => {
      const newData = new Map(prevData);
      const expensesForReceipt = newData.get(currentReceiptId) || [];
      const newExpense = createNewEmptyExpense(currentReceiptId, expensesForReceipt[0]);
      newData.set(currentReceiptId, [...expensesForReceipt, newExpense]);
      return newData;
    });
  };

  const handleUpdateExpense = (tempId: string, field: keyof ExpenseItem, value: any) => {
    if (!currentReceiptId) return;
    setReceiptsData(prevData => {
      const newData = new Map(prevData);
      const expensesForReceipt = newData.get(currentReceiptId);
      if (expensesForReceipt) {
        const updatedExpenses = expensesForReceipt.map(exp => {
          if (exp.tempId === tempId) {
            const updatedExp = { ...exp, [field]: value };
            if (field === 'vat_code') {
              updatedExp.tvsh_percentage = getPercentageFromVatCode(value as string);
            }
            return updatedExp;
          }
          return exp;
        });
        newData.set(currentReceiptId, updatedExpenses);
      }
      return newData;
    });
  };

  const handleDeleteExpense = (tempId: string) => {
    if (!currentReceiptId) return;
    setReceiptsData(prevData => {
      const newData = new Map(prevData);
      const expensesForReceipt = newData.get(currentReceiptId);
      if (expensesForReceipt) {
        const updatedExpenses = expensesForReceipt.filter(exp => exp.tempId !== tempId);
        newData.set(currentReceiptId, updatedExpenses);
      }
      return newData;
    });
  };

  const handleSplitExpense = (tempId: string) => {
    if (!currentReceiptId) return;
    setReceiptsData(prevData => {
      const newData = new Map(prevData);
      const expensesForReceipt = newData.get(currentReceiptId);
      if (expensesForReceipt) {
        const expenseIndex = expensesForReceipt.findIndex(e => e.tempId === tempId);
        if (expenseIndex > -1) {
          const expenseToSplit = expensesForReceipt[expenseIndex];
          const newAmount = parseFloat((expenseToSplit.amount / 2).toFixed(2));
          const newExpense1 = { ...expenseToSplit, tempId: uuidv4(), amount: newAmount, sasia: 1 };
          const newExpense2 = { ...expenseToSplit, tempId: uuidv4(), amount: newAmount, sasia: 1 };
          
          const updatedExpenses = [...expensesForReceipt];
          updatedExpenses.splice(expenseIndex, 1, newExpense1, newExpense2);
          newData.set(currentReceiptId, updatedExpenses);
        }
      }
      return newData;
    });
  };

  const validateExpenses = (): boolean => {
    for (const [receiptIndex, receiptId] of orderedReceiptIds.entries()) {
      const expenses = receiptsData.get(receiptId) || [];
      for (const [expenseIndex, exp] of expenses.entries()) {
        if (!exp.name.trim()) {
          showError(`Receipt ${receiptIndex + 1}, Item #${expenseIndex + 1}: Name is required.`);
          return false;
        }
        if (!exp.category || !allSubcategories.includes(exp.category)) {
          showError(`Receipt ${receiptIndex + 1}, Item #${expenseIndex + 1}: A valid category is required.`);
          return false;
        }
        if (exp.amount <= 0) {
          showError(`Receipt ${receiptIndex + 1}, Item #${expenseIndex + 1}: Amount must be greater than 0.`);
          return false;
        }
        if (exp.sasia === null || exp.sasia <= 0) {
          showError(`Receipt ${receiptIndex + 1}, Item #${expenseIndex + 1}: Quantity (Sasia) must be greater than 0.`);
          return false;
        }
        if (!exp.njesia) {
          showError(`Receipt ${receiptIndex + 1}, Item #${expenseIndex + 1}: Unit (Njesia) is required.`);
          return false;
        }
      }
    }
    return true;
  };

  const handleSaveAllExpenses = async () => {
    if (!validateExpenses()) return;
    if (!session || !batchId) {
      showError('Authentication or batch ID is missing.');
      return;
    }

    setLoading(true);
    const toastId = showLoading('Saving expenses...');

    try {
      const allExpenses = Array.from(receiptsData.values()).flat();
      if (allExpenses.length === 0) {
        showError("No expenses to save.");
        return;
      }

      const expensesToInsert = allExpenses.map((exp) => ({
        user_id: session.user.id,
        receipt_id: exp.receiptId,
        batch_id: batchId,
        name: exp.name.trim(),
        category: exp.category,
        amount: exp.amount,
        date: format(exp.date, 'yyyy-MM-dd'),
        merchant: exp.merchant?.trim() || null,
        vat_code: exp.vat_code,
        tvsh_percentage: exp.tvsh_percentage,
        nui: exp.nui,
        nr_fiskal: exp.nr_fiskal,
        numri_i_tvsh_se: exp.numri_i_tvsh_se,
        description: exp.description,
        sasia: exp.sasia,
        njesia: exp.njesia,
      }));

      const { data: insertedExpenses, error: expensesError } = await supabase
        .from('expenses')
        .insert(expensesToInsert)
        .select();

      if (expensesError) throw new Error(expensesError.message);

      const totalBatchAmount = expensesToInsert.reduce((sum, expense) => sum + expense.amount, 0);
      const { data: currentBatch } = await supabase.from('expense_batches').select('total_amount').eq('id', batchId).single();
      const newTotalAmount = (currentBatch?.total_amount || 0) + totalBatchAmount;
      await supabase.from('expense_batches').update({ total_amount: newTotalAmount }).eq('id', batchId);

      dismissToast(toastId);
      showSuccess('Expenses saved successfully!');

      onExpensesSaved();
      onOpenChange(false);
    } catch (error: any) {
      dismissToast(toastId);
      showError('Failed to save expenses: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleNextReceipt = () => {
    setCurrentReceiptIndex(prev => (prev + 1) % orderedReceiptIds.length);
  };

  const handlePrevReceipt = () => {
    setCurrentReceiptIndex(prev => (prev - 1 + orderedReceiptIds.length) % orderedReceiptIds.length);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-7xl w-full max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle>Review and Split Expenses</DialogTitle>
          <DialogDescription>
            Review the extracted expenses. You can edit, add, delete, or split items before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 p-6 flex-grow overflow-hidden">
          {/* Left Column: Receipt Viewer */}
          <aside className="md:col-span-2 h-full">
            <ReceiptViewer receiptId={currentReceiptId} />
            {orderedReceiptIds.length > 1 && (
              <div className="flex items-center justify-between mt-4">
                <Button onClick={handlePrevReceipt} variant="outline">
                  <ChevronLeft className="h-4 w-4 mr-2" /> Previous
                </Button>
                <span className="text-sm font-medium text-muted-foreground">
                  Receipt {currentReceiptIndex + 1} of {orderedReceiptIds.length}
                </span>
                <Button onClick={handleNextReceipt} variant="outline">
                  Next <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            )}
          </aside>

          {/* Right Column: Expense Forms */}
          <div className="md:col-span-3 overflow-y-auto pr-2 -mr-2">
            {currentExpenses.length > 0 ? (
              <div className="grid gap-4">
                {currentExpenses.map((exp, index) => (
                  <div key={exp.tempId} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center border-b pb-4 mb-4 last:border-b-0 last:pb-0">
                    <div className="col-span-12 text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Expense #{index + 1}
                    </div>
                    
                    {/* Row 1: Name, Category, Amount, VAT Code, Date */}
                    <div className="col-span-6 md:col-span-3">
                      <Label htmlFor={`name-${exp.tempId}`}>Name</Label>
                      <Input id={`name-${exp.tempId}`} value={exp.name} onChange={(e) => handleUpdateExpense(exp.tempId, 'name', e.target.value)} disabled={loading} />
                    </div>
                    <div className="col-span-6 md:col-span-3">
                      <Label htmlFor={`category-${exp.tempId}`}>Category</Label>
                      <Select onValueChange={(value) => handleUpdateExpense(exp.tempId, 'category', value)} value={exp.category} disabled={loading}>
                        <SelectTrigger id={`category-${exp.tempId}`}><SelectValue placeholder="Select a category" /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(expenseCategories).map(([mainCategory, subcategories]) => (
                            <SelectGroup key={mainCategory}>
                              <SelectLabel>{mainCategory}</SelectLabel>
                              {subcategories.map((subCategory) => (<SelectItem key={subCategory} value={subCategory}>{subCategory}</SelectItem>))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <Label htmlFor={`amount-${exp.tempId}`}>Amount</Label>
                      <Input id={`amount-${exp.tempId}`} type="number" step="0.01" value={exp.amount} onChange={(e) => handleUpdateExpense(exp.tempId, 'amount', parseFloat(e.target.value) || 0)} disabled={loading} />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <Label htmlFor={`vat_code-${exp.tempId}`}>VAT Code</Label>
                      <Select onValueChange={(value) => handleUpdateExpense(exp.tempId, 'vat_code', value)} value={exp.vat_code} disabled={loading}>
                        <SelectTrigger id={`vat_code-${exp.tempId}`}><SelectValue placeholder="Select VAT code" /></SelectTrigger>
                        <SelectContent>{vatCodes.map((code) => (<SelectItem key={code} value={code}>{code}</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <Label htmlFor={`date-${exp.tempId}`}>Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant={'outline'} className={cn('w-full justify-start text-left font-normal', !exp.date && 'text-muted-foreground')} disabled={loading}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {exp.date ? format(exp.date, 'PPP') : <span>Pick a date</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar mode="single" selected={exp.date} onSelect={(date) => handleUpdateExpense(exp.tempId, 'date', date!)} initialFocus />
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Row 2: Merchant, NUI, Nr. Fiskal, Numri i TVSH-se */}
                    <div className="col-span-6 md:col-span-2">
                      <Label htmlFor={`merchant-${exp.tempId}`}>Merchant</Label>
                      <Input id={`merchant-${exp.tempId}`} value={exp.merchant || ''} onChange={(e) => handleUpdateExpense(exp.tempId, 'merchant', e.target.value || null)} disabled={loading} />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <Label htmlFor={`nui-${exp.tempId}`}>NUI</Label>
                      <Input id={`nui-${exp.tempId}`} value={exp.nui || ''} onChange={(e) => handleUpdateExpense(exp.tempId, 'nui', e.target.value || null)} disabled={loading} />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <Label htmlFor={`nr_fiskal-${exp.tempId}`}>Nr. Fiskal</Label>
                      <Input id={`nr_fiskal-${exp.tempId}`} value={exp.nr_fiskal || ''} onChange={(e) => handleUpdateExpense(exp.tempId, 'nr_fiskal', e.target.value || null)} disabled={loading} />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <Label htmlFor={`numri_i_tvsh_se-${exp.tempId}`}>Numri i TVSH-se</Label>
                      <Input id={`numri_i_tvsh_se-${exp.tempId}`} value={exp.numri_i_tvsh_se || ''} onChange={(e) => handleUpdateExpense(exp.tempId, 'numri_i_tvsh_se', e.target.value || null)} disabled={loading} />
                    </div>
                    
                    {/* Row 3: Sasia, Njesia, Description, Actions */}
                    <div className="col-span-6 md:col-span-2">
                      <Label htmlFor={`sasia-${exp.tempId}`}>Sasia (Qty)</Label>
                      <Input id={`sasia-${exp.tempId}`} type="number" step="1" value={exp.sasia || 1} onChange={(e) => handleUpdateExpense(exp.tempId, 'sasia', parseFloat(e.target.value) || 0)} disabled={loading} />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <Label htmlFor={`njesia-${exp.tempId}`}>Njesia (Unit)</Label>
                      <Select onValueChange={(value) => handleUpdateExpense(exp.tempId, 'njesia', value)} value={exp.njesia || NJESIA_OPTIONS[0]} disabled={loading}>
                        <SelectTrigger id={`njesia-${exp.tempId}`}><SelectValue placeholder="Select unit" /></SelectTrigger>
                        <SelectContent>
                          {NJESIA_OPTIONS.map((unit) => (<SelectItem key={unit} value={unit}>{unit}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-6 md:col-span-4">
                      <Label htmlFor={`description-${exp.tempId}`}>Description</Label>
                      <Input id={`description-${exp.tempId}`} value={exp.description || ''} onChange={(e) => handleUpdateExpense(exp.tempId, 'description', e.target.value || null)} disabled={loading} />
                    </div>

                    <div className="col-span-12 md:col-span-2 flex items-end justify-end space-x-2 mt-4 md:mt-0">
                      <Button variant="outline" size="icon" onClick={() => handleSplitExpense(exp.tempId)} disabled={loading} title="Split Expense"><Split className="h-4 w-4" /></Button>
                      <Button variant="destructive" size="icon" onClick={() => handleDeleteExpense(exp.tempId)} disabled={loading} title="Delete Expense"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
                <Button onClick={handleAddExpense} variant="secondary" className="mt-4" disabled={loading}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Add New Expense Item
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p>No expenses found for this receipt.</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="p-6 border-t bg-background">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button onClick={handleSaveAllExpenses} disabled={loading || orderedReceiptIds.length === 0}>
            {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>) : ('Save All Expenses')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExpenseSplitterDialog;
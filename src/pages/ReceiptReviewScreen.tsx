'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useReceiptReviewStore } from '@/store/receiptReviewStore';
import { useSession } from '@/components/SessionContextProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Trash2, PlusCircle, Loader2 } from 'lucide-react';
import ReceiptViewer from '@/components/ReceiptViewer';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from '@radix-ui/react-icons';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { NJESIA_OPTIONS } from '@/lib/constants';

// Define categories and VAT codes locally for the form logic
const expenseCategories = {
  "660 Shpenzime te personelit": ["660-01 Paga bruto", "660-02 Sigurimi shendetesor", "660-03 Kontributi pensional"],
  "665 Shpenzimet e zyres": ["665-01 Shpenzimet e qirase", "665-02 Material harxhues", "665-03 Pastrimi", "665-04 Ushqim dhe pije", "665-05 Shpenzime te IT-se", "665-06 Shpenzimt e perfaqesimit", "665-07 Asete nen 1000 euro", "665-09 Te tjera"],
  "667 Sherbimet profesionale": ["667-01 Sherbimet e kontabilitetit", "667-02 Sherbime ligjore", "667-03 Sherbime konsulente", "667-04 Sherbime auditimi"],
  "668 Shpenzimet e udhetimit": ["668-01 Akomodimi", "668-02 Meditja", "668-03 Transporti"],
  "669 Shpenzimet e automjetit": ["669-01 Shpenzimet e karburantit", "669-02 Mirembajtje dhe riparim"],
  "675 Shpenzimet e komunikimit": ["675-01 Interneti", "675-02 Telefon mobil", "675-03 Dergesa postare", "675-04 Telefon fiks"],
  "683 Shpenzimet e sigurimit": ["683-01 Sigurimi i automjeteve", "683-02 Sigurimi i nderteses"],
  "686 Komunalite": ["686-01 Energjia elektrike", "686-02 Ujesjellesi", "686-03 Pastrimi", "686-04 Shpenzimet e ngrohjes"],
  "690 Shpenzime tjera operative": ["690-01 Shpenzimet e anetaresimit", "690-02 Shpenzimet e perkthimit", "690-03 Provizion bankar", "690-04 Mirembajtje e webfaqes", "690-05 Taksa komunale", "690-06 Mirembajtje e llogarise bankare"],
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

interface ExpenseItem {
  id?: string; // Only present if fetched from DB
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
  description: string | null;
  sasia: number | null;
  njesia: string | null;
}

const ReceiptReviewScreen = () => {
  const { receiptId } = useParams<{ receiptId: string }>();
  const navigate = useNavigate();
  const { supabase, session } = useSession();

  const { imageUrl, expenses, setReviewData, clearReviewData } = useReceiptReviewStore();
  const [editedExpenses, setEditedExpenses] = useState<ExpenseItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  const fetchDataForEdit = useCallback(async () => {
    if (!receiptId || !supabase || !session) return;
    setIsFetching(true);
    try {
      // Fetch receipt data (including storage_path which ReceiptViewer needs)
      const { data: receiptData, error: receiptError } = await supabase
        .from('receipts')
        .select('storage_path')
        .eq('id', receiptId)
        .single();

      if (receiptError) throw new Error(`Receipt not found: ${receiptError.message}`);
      if (!receiptData) throw new Error('Receipt data is null.');

      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('*')
        .eq('receipt_id', receiptId);

      if (expensesError) throw new Error(`Failed to fetch expenses: ${expensesError.message}`);

      // Map fetched data to ExpenseItem, ensuring date is string and tvsh_percentage is calculated
      const mappedExpenses: ExpenseItem[] = (expensesData || []).map(exp => ({
        ...exp,
        date: exp.date, // date is already a string in YYYY-MM-DD format from DB
        tvsh_percentage: exp.tvsh_percentage || getPercentageFromVatCode(exp.vat_code || 'No VAT'),
        vat_code: exp.vat_code || 'No VAT',
        sasia: exp.sasia || 1,
        njesia: exp.njesia || NJESIA_OPTIONS[0],
      }));

      setReviewData({ receiptId, imageUrl: receiptData.storage_path, expenses: mappedExpenses });
    } catch (error: any) {
      showError(error.message);
      navigate('/');
    } finally {
      setIsFetching(false);
    }
  }, [receiptId, supabase, session, navigate, setReviewData]);

  useEffect(() => {
    // Check if we need to fetch data (if store is empty or ID mismatch)
    if (!imageUrl || useReceiptReviewStore.getState().receiptId !== receiptId) {
      fetchDataForEdit();
    } else {
      setIsFetching(false);
    }

    return () => {
      clearReviewData();
    };
  }, [receiptId, imageUrl, fetchDataForEdit, clearReviewData]);

  useEffect(() => {
    setEditedExpenses(expenses);
  }, [expenses]);

  const handleInputChange = (index: number, field: keyof ExpenseItem, value: any) => {
    const updatedExpenses = [...editedExpenses];
    const expense = updatedExpenses[index];

    if (field === 'vat_code') {
      expense.vat_code = value;
      expense.tvsh_percentage = getPercentageFromVatCode(value);
    } else if (field === 'amount' || field === 'sasia') {
      expense[field] = parseFloat(value) || 0;
    } else {
      // @ts-ignore
      expense[field] = value;
    }
    setEditedExpenses(updatedExpenses);
  };

  const addNewExpense = () => {
    const newExpense: ExpenseItem = {
      name: 'New Item',
      category: allSubcategories[0] || '690-09 Te tjera',
      amount: 0,
      date: format(new Date(), 'yyyy-MM-dd'),
      merchant: editedExpenses[0]?.merchant || null,
      vat_code: 'No VAT',
      tvsh_percentage: 0,
      nui: editedExpenses[0]?.nui || null,
      nr_fiskal: editedExpenses[0]?.nr_fiskal || null,
      numri_i_tvsh_se: editedExpenses[0]?.numri_i_tvsh_se || null,
      description: null,
      sasia: 1,
      njesia: NJESIA_OPTIONS[0],
    };
    setEditedExpenses([...editedExpenses, newExpense]);
  };

  const removeExpense = (index: number) => {
    const updatedExpenses = editedExpenses.filter((_, i) => i !== index);
    setEditedExpenses(updatedExpenses);
  };

  const validateExpenses = (): boolean => {
    for (const exp of editedExpenses) {
      if (!exp.name.trim()) { showError(`Expense name is required.`); return false; }
      if (!exp.category || !allSubcategories.includes(exp.category)) { showError(`A valid category is required.`); return false; }
      if (exp.amount <= 0) { showError(`Amount must be greater than 0.`); return false; }
      if (exp.sasia === null || exp.sasia <= 0) { showError(`Quantity (Sasia) must be greater than 0.`); return false; }
      if (!exp.njesia || !NJESIA_OPTIONS.includes(exp.njesia)) { showError(`Unit (Njesia) is required.`); return false; }
    }
    return true;
  };

  const handleSave = useCallback(async () => {
    if (!validateExpenses()) return;
    if (!supabase || !session || !receiptId) {
      showError("You must be logged in to save changes.");
      return;
    }
    setIsLoading(true);
    const toastId = showLoading('Saving changes...');

    try {
      // 1. Delete existing expenses linked to this receipt
      await supabase
        .from('expenses')
        .delete()
        .eq('receipt_id', receiptId);
      
      // 2. Insert the updated list of expenses
      const expensesToInsert = editedExpenses.map(exp => ({
        name: exp.name,
        category: exp.category,
        amount: exp.amount,
        date: exp.date,
        merchant: exp.merchant,
        vat_code: exp.vat_code,
        tvsh_percentage: exp.tvsh_percentage,
        nui: exp.nui,
        nr_fiskal: exp.nr_fiskal,
        numri_i_tvsh_se: exp.numri_i_tvsh_se,
        description: exp.description,
        sasia: exp.sasia,
        njesia: exp.njesia,
        receipt_id: receiptId,
        user_id: session.user.id,
      }));

      const { error: insertError } = await supabase
        .from('expenses')
        .insert(expensesToInsert);

      if (insertError) throw insertError;

      // 3. Update receipt status to processed (if it wasn't already)
      await supabase
        .from('receipts')
        .update({ status: 'processed' })
        .eq('id', receiptId);

      showSuccess("Expenses saved successfully!");
      navigate('/');
    } catch (error: any) {
      dismissToast(toastId);
      console.error("Error saving expenses:", error);
      showError("Failed to save expenses: " + error.message);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, session, receiptId, editedExpenses, navigate]);

  if (isFetching) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-2">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-lg text-muted-foreground">Loading Receipt for Review...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Review Receipt: {receiptId?.substring(0, 8)}...</h1>
        <div className="flex gap-4">
          <Button variant="outline" onClick={() => navigate('/')} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
            ) : (
              'Save All Changes'
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column: Receipt Viewer (40% width) */}
        <Card className="lg:col-span-2 h-full">
          <CardHeader>
            <CardTitle>Receipt Image</CardTitle>
            <CardDescription>Zoom and pan to verify extracted data.</CardDescription>
          </CardHeader>
          <CardContent className="p-4 h-[60vh] min-h-[400px]">
            <ReceiptViewer receiptId={receiptId} />
          </CardContent>
        </Card>

        {/* Right Column: Expense Editor (60% width) */}
        <div className="lg:col-span-3 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Expense Items ({editedExpenses.length})</h2>
            <Button onClick={addNewExpense} size="sm" disabled={isLoading}>
              <PlusCircle className="w-4 h-4 mr-2" /> Add Item
            </Button>
          </div>
          
          {editedExpenses.map((expense, index) => (
            <Card key={expense.id || index} className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between p-4 border-b">
                <CardTitle className="text-lg">Item #{index + 1}</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => removeExpense(index)} disabled={isLoading}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4">
                {/* Row 1: Name */}
                <div className="sm:col-span-2 space-y-1">
                  <Label htmlFor={`name-${index}`}>Name</Label>
                  <Input id={`name-${index}`} value={expense.name} onChange={(e) => handleInputChange(index, 'name', e.target.value)} disabled={isLoading} />
                </div>

                {/* Row 2: Category */}
                <div className="sm:col-span-2 space-y-1">
                  <Label htmlFor={`category-${index}`}>Category</Label>
                  <Select 
                    value={expense.category} 
                    onValueChange={(value) => handleInputChange(index, 'category', value)}
                    disabled={isLoading}
                  >
                    <SelectTrigger id={`category-${index}`}><SelectValue /></SelectTrigger>
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

                {/* Row 3: Amount & Date */}
                <div className="space-y-1">
                  <Label htmlFor={`amount-${index}`}>Amount</Label>
                  <Input 
                    id={`amount-${index}`} 
                    type="number" 
                    step="0.01" 
                    value={expense.amount} 
                    onChange={(e) => handleInputChange(index, 'amount', e.target.value)} 
                    disabled={isLoading} 
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`date-${index}`}>Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant={'outline'}
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !expense.date && 'text-muted-foreground'
                        )}
                        disabled={isLoading}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {expense.date ? format(new Date(expense.date), 'PPP') : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={new Date(expense.date)}
                        onSelect={(date) => handleInputChange(index, 'date', format(date!, 'yyyy-MM-dd'))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Row 4: Sasia & Njesia */}
                <div className="space-y-1">
                  <Label htmlFor={`sasia-${index}`}>Sasia (Qty)</Label>
                  <Input 
                    id={`sasia-${index}`} 
                    type="number" 
                    step="1" 
                    value={expense.sasia || 1} 
                    onChange={(e) => handleInputChange(index, 'sasia', e.target.value)} 
                    disabled={isLoading} 
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`njesia-${index}`}>Njesia (Unit)</Label>
                  <Select 
                    value={expense.njesia || NJESIA_OPTIONS[0]} 
                    onValueChange={(value) => handleInputChange(index, 'njesia', value)}
                    disabled={isLoading}
                  >
                    <SelectTrigger id={`njesia-${index}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {NJESIA_OPTIONS.map((unit) => (<SelectItem key={unit} value={unit}>{unit}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Row 5: Merchant & NUI */}
                <div className="space-y-1">
                  <Label htmlFor={`merchant-${index}`}>Merchant</Label>
                  <Input id={`merchant-${index}`} value={expense.merchant || ''} onChange={(e) => handleInputChange(index, 'merchant', e.target.value)} disabled={isLoading} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`nui-${index}`}>NUI</Label>
                  <Input id={`nui-${index}`} value={expense.nui || ''} onChange={(e) => handleInputChange(index, 'nui', e.target.value)} disabled={isLoading} />
                </div>

                {/* Row 6: Nr. Fiskal & Numri i TVSH-se */}
                <div className="space-y-1">
                  <Label htmlFor={`nr_fiskal-${index}`}>Nr. Fiskal</Label>
                  <Input id={`nr_fiskal-${index}`} value={expense.nr_fiskal || ''} onChange={(e) => handleInputChange(index, 'nr_fiskal', e.target.value)} disabled={isLoading} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`numri_i_tvsh_se-${index}`}>Numri i TVSH-se</Label>
                  <Input id={`numri_i_tvsh_se-${index}`} value={expense.numri_i_tvsh_se || ''} onChange={(e) => handleInputChange(index, 'numri_i_tvsh_se', e.target.value)} disabled={isLoading} />
                </div>

                {/* Row 7: VAT Code & TVSH (%) */}
                <div className="space-y-1">
                  <Label htmlFor={`vat_code-${index}`}>VAT Code</Label>
                  <Select 
                    value={expense.vat_code} 
                    onValueChange={(value) => handleInputChange(index, 'vat_code', value)}
                    disabled={isLoading}
                  >
                    <SelectTrigger id={`vat_code-${index}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {vatCodes.map((code) => (<SelectItem key={code} value={code}>{code}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`tvsh_percentage-${index}`}>TVSH (%)</Label>
                  <Input
                    id={`tvsh_percentage-${index}`}
                    type="number"
                    value={expense.tvsh_percentage}
                    className="bg-muted/50 cursor-not-allowed"
                    readOnly
                    disabled
                  />
                </div>

                {/* Row 8: Description (Span 2) */}
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor={`description-${index}`}>Description</Label>
                  <Textarea
                    id={`description-${index}`}
                    value={expense.description || ''}
                    onChange={(e) => handleInputChange(index, 'description', e.target.value)}
                    className="min-h-[80px]"
                    disabled={isLoading}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      
      <div className="mt-8 flex justify-end gap-4 border-t pt-4">
        <Button variant="outline" onClick={() => navigate('/')} disabled={isLoading}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isLoading}>
          {isLoading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
          ) : (
            'Save All Changes'
          )}
        </Button>
      </div>
    </div>
  );
};

export default ReceiptReviewScreen;
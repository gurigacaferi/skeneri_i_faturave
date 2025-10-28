import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Check, X, Trash2 } from 'lucide-react';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { format } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePicker } from './ui/DatePicker'; // CORRECTED PATH
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

// Define the structure for the receipt data
interface ReceiptData {
  id: string;
  image_url: string;
  batch_id: string;
  status: 'pending' | 'processed' | 'failed';
  expenses: ExpenseData[];
}

// Define the structure for a single expense item extracted from the receipt
interface ExpenseData {
  id: string; // This is a temporary ID for the review process
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
  sasia: number;
  njesia: string;
}

interface ReceiptReviewProps {
  receipt: ReceiptData;
  onReviewComplete: () => void;
}

// --- Viewer.js Integration ---
const useViewerJs = (imageUrl: string | null, elementId: string) => {
  useEffect(() => {
    if (imageUrl) {
      // Dynamically import Viewer.js
      import('https://unpkg.com/viewerjs/dist/viewer.esm.js')
        .then(({ default: Viewer }) => {
          const imageElement = document.getElementById(elementId) as HTMLImageElement;
          if (imageElement) {
            // Ensure the image is loaded before initializing Viewer
            const initializeViewer = () => {
              // Destroy any existing viewer instance to prevent duplicates
              if ((imageElement as any).viewer) {
                (imageElement as any).viewer.destroy();
              }
              
              // Initialize the new viewer instance
              new Viewer(imageElement, {
                movable: true, zoomable: true, zoomOnWheel: true, zoomOnTouch: true,
                inline: true, // Use inline mode for the split screen
                navbar: false, // Hide navigation
                title: false, // Hide title
                toolbar: {
                  zoomIn: true,
                  zoomOut: true,
                  oneToOne: true,
                  reset: true,
                  prev: false,
                  play: false,
                  next: false,
                  rotateLeft: true,
                  rotateRight: true,
                  flipHorizontal: true,
                  flipVertical: true,
                },
              });
            };

            imageElement.onload = initializeViewer;
            // If the image is already loaded (e.g., cached), manually trigger initialization
            if (imageElement.complete) {
                initializeViewer();
            }
          }
        })
        .catch(err => console.error("Failed to load Viewer.js:", err));
    }
  }, [imageUrl, elementId]);
};
// -----------------------------

const ReceiptReview: React.FC<ReceiptReviewProps> = ({ receipt, onReviewComplete }) => {
  const { supabase, session, categories, vatCodes, units } = useSession();
  const [expenses, setExpenses] = useState<ExpenseData[]>(receipt.expenses);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Initialize Viewer.js for the receipt image
  useViewerJs(receipt.image_url, 'receipt-image');

  // Update local state when receipt prop changes (e.g., after a re-fetch)
  useEffect(() => {
    setExpenses(receipt.expenses);
  }, [receipt.expenses]);

  const handleExpenseChange = useCallback((index: number, field: keyof ExpenseData, value: any) => {
    setExpenses(prevExpenses => {
      const newExpenses = [...prevExpenses];
      const updatedExpense = { ...newExpenses[index], [field]: value };

      // Auto-calculate tvsh_percentage if vat_code changes
      if (field === 'vat_code') {
        const vatCode = value as string;
        const match = vatCode.match(/(\d+)%/);
        updatedExpense.tvsh_percentage = match ? parseInt(match[1], 10) : 0;
      }

      newExpenses[index] = updatedExpense;
      return newExpenses;
    });
  }, []);

  const handleRemoveExpense = useCallback((index: number) => {
    setExpenses(prevExpenses => prevExpenses.filter((_, i) => i !== index));
  }, []);

  const handleSaveExpenses = async () => {
    if (!session) return;
    if (expenses.length === 0) {
      showError("Cannot save: No expenses remaining.");
      return;
    }

    setIsSaving(true);
    const toastId = showLoading('Saving expenses...');

    try {
      const expensesToInsert = expenses.map(exp => ({
        user_id: session.user.id,
        receipt_id: receipt.id,
        name: exp.name,
        category: exp.category,
        amount: exp.amount,
        date: exp.date,
        merchant: exp.merchant,
        tvsh_percentage: exp.tvsh_percentage,
        vat_code: exp.vat_code,
        nui: exp.nui,
        nr_fiskal: exp.nr_fiskal,
        numri_i_tvsh_se: exp.numri_i_tvsh_se,
        description: exp.description,
        sasia: exp.sasia,
        njesia: exp.njesia,
      }));

      // 1. Insert the expenses
      const { error: expenseError } = await supabase
        .from('expenses')
        .insert(expensesToInsert);

      if (expenseError) throw new Error(expenseError.message);

      // 2. Update the receipt status
      const { error: receiptError } = await supabase
        .from('receipts')
        .update({ status: 'processed' })
        .eq('id', receipt.id);

      if (receiptError) throw new Error(receiptError.message);

      showSuccess(`${expenses.length} expenses saved successfully!`);
      onReviewComplete();
    } catch (error: any) {
      showError('Failed to save expenses: ' + error.message);
    } finally {
      dismissToast(toastId);
      setIsSaving(false);
    }
  };

  const handleDeleteReceipt = async () => {
    if (!session) return;
    setIsDeleting(true);
    const toastId = showLoading('Deleting receipt and associated data...');

    try {
      // 1. Delete the receipt record (which should cascade delete related expenses if RLS is set up correctly, but we'll delete explicitly for safety)
      const { error: receiptError } = await supabase
        .from('receipts')
        .delete()
        .eq('id', receipt.id);

      if (receiptError) throw new Error(receiptError.message);

      // 2. Delete the file from storage
      const filePath = receipt.image_url.split('/').pop();
      if (filePath) {
        const { error: storageError } = await supabase.storage
          .from('receipts')
          .remove([filePath]);
        
        if (storageError) console.error("Storage deletion warning:", storageError.message);
      }

      showSuccess('Receipt and data deleted successfully!');
      onReviewComplete();
    } catch (error: any) {
      showError('Failed to delete receipt: ' + error.message);
    } finally {
      dismissToast(toastId);
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6 text-center">Review Extracted Expenses</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[80vh]">
        
        {/* LEFT SIDE: Image Viewer */}
        <div className="relative h-full overflow-hidden rounded-xl border shadow-xl bg-secondary/50 p-2">
          <h2 className="text-lg font-semibold mb-2 text-center">Receipt Image (Zoom & Drag)</h2>
          <div className="h-[calc(100%-3rem)] flex items-center justify-center">
            <img 
              id="receipt-image" 
              src={receipt.image_url} 
              alt="Receipt to review" 
              className="max-w-full max-h-full object-contain cursor-move" 
              style={{ display: 'block', width: '100%', height: '100%' }}
            />
          </div>
        </div>

        {/* RIGHT SIDE: Review Form */}
        <Card className="h-full overflow-y-auto shadow-xl">
          <CardHeader className="sticky top-0 bg-white z-10 border-b pb-4">
            <CardTitle className="text-2xl">Extracted Data</CardTitle>
            <CardDescription>
              Please verify and correct the data extracted from the receipt before saving.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8 pt-6">
            {expenses.length === 0 ? (
              <div className="text-center py-12 text-foreground/60">
                <p>No expenses were extracted from this receipt.</p>
                <p className="text-sm">You can delete the receipt or manually add expenses.</p>
              </div>
            ) : (
              expenses.map((expense, index) => (
                <div key={index} className="border p-4 rounded-lg shadow-sm relative bg-background">
                  <h3 className="text-lg font-semibold mb-3">Expense Item {index + 1}</h3>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 text-destructive hover:bg-destructive/10"
                    onClick={() => handleRemoveExpense(index)}
                    title="Remove this expense item"
                  >
                    <X className="h-4 w-4" />
                  </Button>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`name-${index}`}>Item Name</Label>
                      <Input
                        id={`name-${index}`}
                        value={expense.name || ''}
                        onChange={(e) => handleExpenseChange(index, 'name', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`amount-${index}`}>Amount (€)</Label>
                      <Input
                        id={`amount-${index}`}
                        type="number"
                        step="0.01"
                        value={expense.amount || ''}
                        onChange={(e) => handleExpenseChange(index, 'amount', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`category-${index}`}>Category</Label>
                      <Select
                        value={expense.category}
                        onValueChange={(value) => handleExpenseChange(index, 'category', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map(cat => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`vat_code-${index}`}>VAT Code</Label>
                      <Select
                        value={expense.vat_code}
                        onValueChange={(value) => handleExpenseChange(index, 'vat_code', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select VAT Code" />
                        </SelectTrigger>
                        <SelectContent>
                          {vatCodes.map(code => (
                            <SelectItem key={code} value={code}>
                              {code}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`sasia-${index}`}>Sasia (Quantity)</Label>
                      <Input
                        id={`sasia-${index}`}
                        type="number"
                        step="0.01"
                        value={expense.sasia || 1}
                        onChange={(e) => handleExpenseChange(index, 'sasia', parseFloat(e.target.value) || 1)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`njesia-${index}`}>Njesia (Unit)</Label>
                      <Select
                        value={expense.njesia}
                        onValueChange={(value) => handleExpenseChange(index, 'njesia', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Unit" />
                        </SelectTrigger>
                        <SelectContent>
                          {units.map(unit => (
                            <SelectItem key={unit} value={unit}>
                              {unit}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`date-${index}`}>Date</Label>
                      <DatePicker
                        date={expense.date ? new Date(expense.date) : undefined}
                        onDateChange={(date) => handleExpenseChange(index, 'date', date ? format(date, 'yyyy-MM-dd') : '')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`merchant-${index}`}>Merchant</Label>
                      <Input
                        id={`merchant-${index}`}
                        value={expense.merchant || ''}
                        onChange={(e) => handleExpenseChange(index, 'merchant', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor={`description-${index}`}>Description</Label>
                      <Textarea
                        id={`description-${index}`}
                        value={expense.description || ''}
                        onChange={(e) => handleExpenseChange(index, 'description', e.target.value)}
                      />
                    </div>
                    {/* Hidden fields for NUI, Nr. Fiskal, etc. */}
                    <div className="hidden">
                      <Input value={expense.nui || ''} onChange={(e) => handleExpenseChange(index, 'nui', e.target.value)} />
                      <Input value={expense.nr_fiskal || ''} onChange={(e) => handleExpenseChange(index, 'nr_fiskal', e.target.value)} />
                      <Input value={expense.numri_i_tvsh_se || ''} onChange={(e) => handleExpenseChange(index, 'numri_i_tvsh_se', e.target.value)} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
          <CardFooter className="sticky bottom-0 bg-white z-10 border-t pt-4 flex justify-between">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isDeleting || isSaving}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete Receipt
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this receipt and all extracted data? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleDeleteReceipt}
                    className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  >
                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Yes, Delete'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button onClick={handleSaveExpenses} disabled={isSaving || expenses.length === 0}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Save {expenses.length} Expenses
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default ReceiptReview;
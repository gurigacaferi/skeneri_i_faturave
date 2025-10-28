'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useReceiptReviewStore } from '@/store/receiptReviewStore';
import { useSession } from '@/components/SessionContextProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ALL_SUBCATEGORIES, VAT_CODES, NJESIA_OPTIONS } from '@/lib/constants';
import { showError, showSuccess } from '@/utils/toast';
import { Trash2, PlusCircle, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

const ReceiptReviewScreen = () => {
  const { receiptId } = useParams<{ receiptId: string }>();
  const navigate = useNavigate();
  const { supabase, session } = useSession();

  const { imageUrl, expenses, setReviewData, clearReviewData } = useReceiptReviewStore();
  const [editedExpenses, setEditedExpenses] = useState(expenses);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  const fetchDataForEdit = useCallback(async () => {
    if (!receiptId || !supabase || !session) return;
    setIsFetching(true);
    try {
      // 1. Fetch receipt details (including storage path)
      const { data: receiptData, error: receiptError } = await supabase
        .from('receipts')
        .select('storage_path')
        .eq('id', receiptId)
        .single();

      if (receiptError) throw new Error(`Receipt not found: ${receiptError.message}`);
      if (!receiptData?.storage_path) throw new Error('Receipt storage path is missing.');

      // 2. Get public URL
      const { data: urlData } = supabase.storage
        .from('receipts')
        .getPublicUrl(receiptData.storage_path);

      if (!urlData?.publicUrl) throw new Error('Could not generate public URL.');

      // 3. Fetch expenses
      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('*')
        .eq('receipt_id', receiptId);

      if (expensesError) throw new Error(`Failed to fetch expenses: ${expensesError.message}`);

      setReviewData({ receiptId, imageUrl: urlData.publicUrl, expenses: expensesData || [] });
    } catch (error: any) {
      showError(error.message);
      navigate('/');
    } finally {
      setIsFetching(false);
    }
  }, [receiptId, supabase, session, navigate, setReviewData]);

  useEffect(() => {
    if (!imageUrl || useReceiptReviewStore.getState().receiptId !== receiptId) {
      fetchDataForEdit();
    } else {
      setIsFetching(false);
    }

    // Note: Removed the cleanup function to clear data, as it was causing issues 
    // when navigating back and forth. Data should only be cleared on successful save/exit.
  }, [receiptId, imageUrl, fetchDataForEdit]);

  useEffect(() => {
    setEditedExpenses(expenses);
  }, [expenses]);

  const handleInputChange = (index: number, field: string, value: string | number) => {
    const updatedExpenses = [...editedExpenses];
    // @ts-ignore
    updatedExpenses[index][field] = value;
    setEditedExpenses(updatedExpenses);
  };

  const addNewExpense = () => {
    const newExpense = {
      name: 'New Item',
      category: ALL_SUBCATEGORIES[0] || '690-09 Te tjera',
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      merchant: editedExpenses[0]?.merchant || '',
      vat_code: 'No VAT',
      tvsh_percentage: 0,
      nui: editedExpenses[0]?.nui || null,
      nr_fiskal: editedExpenses[0]?.nr_fiskal || null,
      numri_i_tvsh_se: editedExpenses[0]?.numri_i_tvsh_se || null,
      description: '',
      sasia: 1,
      njesia: NJESIA_OPTIONS[0] || 'cope',
    };
    setEditedExpenses([...editedExpenses, newExpense]);
  };

  const removeExpense = (index: number) => {
    const updatedExpenses = editedExpenses.filter((_, i) => i !== index);
    setEditedExpenses(updatedExpenses);
  };

  const handleSave = useCallback(async () => {
    if (!supabase || !session || !receiptId) {
      showError("You must be logged in to save changes.");
      return;
    }
    setIsLoading(true);

    try {
      // 1. Update receipt status (optional, but good practice)
      await supabase
        .from('receipts')
        .update({ status: 'processed' })
        .eq('id', receiptId);

      // 2. Delete existing expenses for this receipt
      await supabase
        .from('expenses')
        .delete()
        .eq('receipt_id', receiptId);
      
      // 3. Insert updated expenses
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

      showSuccess("Expenses saved successfully!");
      navigate('/');
    } catch (error: any) {
      console.error("Error saving expenses:", error);
      showError("Failed to save expenses: " + error.message);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, session, receiptId, editedExpenses, navigate]);

  if (isFetching) {
    return <div className="text-center p-8">Loading receipt details...</div>;
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-4rem)] bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* Left Pane: Image Viewer */}
      <div className="w-full md:w-1/2 h-1/2 md:h-full p-4 flex flex-col bg-gray-100 dark:bg-gray-800 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700">
        <div className="flex-grow border rounded-lg overflow-hidden bg-white dark:bg-black relative">
          <TransformWrapper>
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                <div className="absolute top-2 left-2 z-10 flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => zoomIn()}><ZoomIn className="w-4 h-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => zoomOut()}><ZoomOut className="w-4 h-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => resetTransform()}><RotateCcw className="w-4 h-4" /></Button>
                </div>
                <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%', height: '100%', cursor: 'grab' }}>
                  <img src={imageUrl} alt="Scanned Receipt" className="w-full h-full object-contain" />
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
        </div>
      </div>

      {/* Right Pane: Expense Editor */}
      <div className="w-full md:w-1/2 h-1/2 md:h-full p-4 overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Review Expenses</h2>
            <Button onClick={addNewExpense} size="sm"><PlusCircle className="w-4 h-4 mr-2" /> Add Item</Button>
        </div>
        <div className="space-y-6">
          {editedExpenses.map((expense, index) => (
            <Card key={index} className="bg-white dark:bg-gray-800 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between p-4">
                <CardTitle className="text-base">Item #{index + 1}</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => removeExpense(index)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4">
                <div className="sm:col-span-2">
                  <Label htmlFor={`name-${index}`}>Item Name</Label>
                  <Input id={`name-${index}`} value={expense.name} onChange={(e) => handleInputChange(index, 'name', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor={`amount-${index}`}>Amount</Label>
                  <Input id={`amount-${index}`} type="number" value={expense.amount} onChange={(e) => handleInputChange(index, 'amount', parseFloat(e.target.value))} />
                </div>
                <div>
                  <Label htmlFor={`date-${index}`}>Date</Label>
                  <Input id={`date-${index}`} type="date" value={expense.date} onChange={(e) => handleInputChange(index, 'date', e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor={`category-${index}`}>Category</Label>
                  <Select value={expense.category} onValueChange={(value) => handleInputChange(index, 'category', value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ALL_SUBCATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                 <div>
                  <Label htmlFor={`sasia-${index}`}>Quantity</Label>
                  <Input id={`sasia-${index}`} type="number" value={expense.sasia ?? 1} onChange={(e) => handleInputChange(index, 'sasia', parseFloat(e.target.value))} />
                </div>
                <div>
                  <Label htmlFor={`njesia-${index}`}>Unit</Label>
                   <Select value={expense.njesia ?? 'cope'} onValueChange={(value) => handleInputChange(index, 'njesia', value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {NJESIA_OPTIONS.map(unit => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor={`vat_code-${index}`}>VAT Code</Label>
                  <Select value={expense.vat_code} onValueChange={(value) => handleInputChange(index, 'vat_code', value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VAT_CODES.map(code => <SelectItem key={code} value={code}>{code}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor={`merchant-${index}`}>Merchant</Label>
                  <Input id={`merchant-${index}`} value={expense.merchant || ''} onChange={(e) => handleInputChange(index, 'merchant', e.target.value)} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-4">
            <Button variant="outline" onClick={() => navigate('/')}>Cancel</Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptReviewScreen;
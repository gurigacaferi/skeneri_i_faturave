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
import { validSubcategories, validVatCodes, validUnits } from '@/lib/constants';
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
    console.log(`Fetching data for receipt ID: ${receiptId}`);
    setIsFetching(true);
    try {
      const { data: receiptData, error: receiptError } = await supabase
        .from('receipts')
        .select('image_url')
        .eq('id', receiptId)
        .single();

      if (receiptError) throw new Error(`Receipt not found: ${receiptError.message}`);
      if (!receiptData) throw new Error('Receipt data is null.');

      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('*')
        .eq('receipt_id', receiptId);

      if (expensesError) throw new Error(`Failed to fetch expenses: ${expensesError.message}`);

      // Populate the store with the fetched data
      setReviewData({ imageUrl: receiptData.image_url, expenses: expensesData || [] });
    } catch (error: any) {
      showError(error.message);
      navigate('/');
    } finally {
      setIsFetching(false);
    }
  }, [receiptId, supabase, session, navigate, setReviewData]);

  useEffect(() => {
    // If the component mounts and the store's data doesn't match the current receiptId,
    // it means we're in "edit" mode and need to fetch data.
    if (!imageUrl || useReceiptReviewStore.getState().receiptId !== receiptId) {
      fetchDataForEdit();
    } else {
      // Data is already in the store (from the upload/scan flow)
      setIsFetching(false);
    }

    // Cleanup store on unmount
    return () => {
      clearReviewData();
    };
  }, [receiptId, imageUrl, fetchDataForEdit, clearReviewData]);

  useEffect(() => {
    // When the expenses from the store change (either from initial load or fetch),
    // update the local state for editing.
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
      category: '690-09 Te tjera',
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
      njesia: 'cope',
    };
    setEditedExpenses([...editedExpenses, newExpense]);
  };

  const removeExpense = (index: number) => {
    const updatedExpenses = editedExpenses.filter((_, i) => i !== index);
    setEditedExpenses(updatedExpenses);
  };

  const handleSave = async () => {
    if (!supabase || !session || !receiptId) {
      showError("You must be logged in to save changes.");
      return;
    }
    setIsLoading(true);

    try {
      await supabase
        .from('receipts')
        .update({ status: 'processed' })
        .eq('id', receiptId);

      const expensesToInsert = editedExpenses.map(exp => ({
        ...exp,
        receipt_id: receiptId,
        user_id: session.user.id,
      }));

      await supabase
        .from('expenses')
        .delete()
        .eq('receipt_id', receiptId);
      
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
  };

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
                      {validSubcategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
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
                      {validUnits.map(unit => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor={`vat_code-${index}`}>VAT Code</Label>
                  <Select value={expense.vat_code} onValueChange={(value) => handleInputChange(index, 'vat_code', value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {validVatCodes.map(code => <SelectItem key={code} value={code}>{code}</SelectItem>)}
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
              {isLoading ? 'Saving...' : 'Saving...'}
            </Button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptReviewScreen;
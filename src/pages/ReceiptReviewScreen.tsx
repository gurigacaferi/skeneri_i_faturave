'use client';

import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    // If the page is loaded directly and the store is empty, redirect or fetch data.
    // For now, we redirect to home if the essential data is missing.
    if (!imageUrl || !receiptId) {
      console.warn("No review data found in store, redirecting.");
      navigate('/');
    }
    // Sync store changes to local state
    setEditedExpenses(expenses);
  }, [expenses, imageUrl, receiptId, navigate]);

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
      // 1. Update the receipt status to 'processed'
      const { error: receiptUpdateError } = await supabase
        .from('receipts')
        .update({ status: 'processed' })
        .eq('id', receiptId);

      if (receiptUpdateError) throw receiptUpdateError;

      // 2. Prepare expense data, linking each to the receipt
      const expensesToInsert = editedExpenses.map(exp => ({
        ...exp,
        receipt_id: receiptId,
        user_id: session.user.id,
      }));

      // 3. Upsert expenses (insert new, update existing if they had an ID)
      // For this flow, we delete all existing and insert the new set to keep it simple.
      const { error: deleteError } = await supabase
        .from('expenses')
        .delete()
        .eq('receipt_id', receiptId);
      
      if (deleteError) throw deleteError;

      const { error: insertError } = await supabase
        .from('expenses')
        .insert(expensesToInsert);

      if (insertError) throw insertError;

      showSuccess("Expenses saved successfully!");
      clearReviewData(); // Clear the store
      navigate('/'); // Navigate back to the dashboard
    } catch (error: any) {
      console.error("Error saving expenses:", error);
      showError("Failed to save expenses: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!imageUrl) {
    return <div className="text-center p-8">Loading receipt data or redirecting...</div>;
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-4rem)] bg-gray-50 dark:bg-gray-900">
      {/* Left Pane: Image Viewer */}
      <div className="w-full md:w-1/2 h-1/2 md:h-full p-4 flex flex-col bg-gray-100 dark:bg-gray-800">
        <h2 className="text-lg font-semibold mb-2 text-center">Receipt Image</h2>
        <div className="flex-grow border rounded-lg overflow-hidden bg-white dark:bg-black">
          <TransformWrapper>
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                <div className="flex justify-center items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 border-b">
                    <Button variant="outline" size="sm" onClick={() => zoomIn()}><ZoomIn className="w-4 h-4 mr-1" /> Zoom In</Button>
                    <Button variant="outline" size="sm" onClick={() => zoomOut()}><ZoomOut className="w-4 h-4 mr-1" /> Zoom Out</Button>
                    <Button variant="outline" size="sm" onClick={() => resetTransform()}><RotateCcw className="w-4 h-4 mr-1" /> Reset</Button>
                </div>
                <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%', height: '100%' }}>
                  <img src={imageUrl} alt="Scanned Receipt" className="w-full h-auto object-contain" />
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
        </div>
      </div>

      {/* Right Pane: Expense Editor */}
      <div className="w-full md:w-1/2 h-1/2 md:h-full p-4 overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Review & Edit Expenses</h2>
            <Button onClick={addNewExpense} size="sm"><PlusCircle className="w-4 h-4 mr-2" /> Add Item</Button>
        </div>
        <div className="space-y-6">
          {editedExpenses.map((expense, index) => (
            <Card key={index} className="bg-white dark:bg-gray-800 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Item #{index + 1}</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => removeExpense(index)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
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
                    <SelectTrigger><SelectValue placeholder="Select unit..." /></SelectTrigger>
                    <SelectContent>
                      {validUnits.map(unit => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor={`vat_code-${index}`}>VAT Code</Label>
                  <Select value={expense.vat_code} onValueChange={(value) => handleInputChange(index, 'vat_code', value)}>
                    <SelectTrigger><SelectValue placeholder="Select VAT code..." /></SelectTrigger>
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
              {isLoading ? 'Saving...' : 'Save Expenses'}
            </Button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptReviewScreen;
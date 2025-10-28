import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RecentExpenses } from '@/components/RecentExpenses';
import { Overview } from '@/components/Overview';
import { FileUploader } from '@/components/FileUploader';
import { ExpenseBatchList } from '@/components/ExpenseBatchList';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import ExpenseSplitterDialog from '@/components/ExpenseSplitterDialog';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

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

export default function Dashboard() {
  const { supabase, session, isConnectedToQuickBooks } = useSession();
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [isSplitterDialogOpen, setIsSplitterDialogOpen] = useState(false);
  const [splitterInitialData, setSplitterInitialData] = useState<InitialExpenseData[] | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleUploadSuccess = (receiptId: string, batchId: string) => {
    showSuccess(`Receipt ${receiptId} uploaded successfully to batch ${batchId}!`);
    setActiveBatchId(batchId);
    // Invalidate queries to refetch data
    queryClient.invalidateQueries({ queryKey: ['expenseBatches'] });
    queryClient.invalidateQueries({ queryKey: ['receiptsForBatch', batchId] });
  };

  const handleProcessingSuccess = (processedData: any, receiptId: string) => {
    if (!processedData || processedData.length === 0) {
      showError("AI couldn't extract any expense items from the receipt.");
      return;
    }
    
    // Ensure each expense item is associated with the correct receiptId
    const initialData = processedData.map((expense: any) => ({
      receiptId: receiptId, // This was the missing piece
      expense: {
        name: expense.name || 'Unnamed Item',
        category: expense.category || 'Other',
        amount: expense.amount || 0,
        date: expense.date || new Date().toISOString().split('T')[0],
        merchant: expense.merchant || null,
        tvsh_percentage: expense.tvsh_percentage || 0,
        vat_code: expense.vat_code || 'No VAT',
        nui: expense.nui || null,
        nr_fiskal: expense.nr_fiskal || null,
        numri_i_tvsh_se: expense.numri_i_tvsh_se || null,
        description: expense.description || null,
      }
    }));

    setSplitterInitialData(initialData);
    setIsSplitterDialogOpen(true);
  };

  const handleExpensesSaved = () => {
    if (activeBatchId) {
      queryClient.invalidateQueries({ queryKey: ['receiptsForBatch', activeBatchId] });
      queryClient.invalidateQueries({ queryKey: ['expenseBatches'] });
    }
    setIsSplitterDialogOpen(false);
    setSplitterInitialData(null);
  };

  const handleSelectBatch = (batchId: string) => {
    setActiveBatchId(batchId);
    navigate(`/batch/${batchId}`);
  };

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
      </div>
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="batches">Expense Batches</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Cards can be added here if needed */}
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="col-span-4">
              <CardHeader>
                <CardTitle>Overview</CardTitle>
              </CardHeader>
              <CardContent className="pl-2">
                <Overview />
              </CardContent>
            </Card>
            <Card className="col-span-3">
              <CardHeader>
                <CardTitle>Recent Expenses</CardTitle>
                <CardDescription>You have 265 expenses this month.</CardDescription>
              </CardHeader>
              <CardContent>
                <RecentExpenses />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="batches" className="space-y-4">
          <ExpenseBatchList onSelectBatch={handleSelectBatch} />
        </TabsContent>
      </Tabs>
      <ExpenseSplitterDialog
        open={isSplitterDialogOpen}
        onOpenChange={setIsSplitterDialogOpen}
        initialExpenses={splitterInitialData}
        batchId={activeBatchId}
        onExpensesSaved={handleExpensesSaved}
        isConnectedToQuickBooks={isConnectedToQuickBooks}
      />
    </div>
  );
}
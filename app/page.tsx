'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Receipt, Expense } from '@/lib/types';
import { getReceiptsForUser, getExpensesForReceipt } from '@/lib/db-client';
import { ReceiptCard } from '@/components/ReceiptCard';
import { UploadDropzone } from '@/components/UploadDropzone';
import { useToast } from '@/components/ui/use-toast';

type ProcessingStatus = 'idle' | 'uploading' | 'polling' | 'success' | 'error';

export default function HomePage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  const supabase = createClientComponentClient();
  const { toast } = useToast();

  const fetchReceipts = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const userReceipts = await getReceiptsForUser(user.id);
      setReceipts(userReceipts);
    }
  }, [supabase.auth]);

  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  const handleSelectReceipt = async (receipt: Receipt) => {
    setSelectedReceipt(receipt);
    if (receipt.status === 'completed') {
      const receiptExpenses = await getExpensesForReceipt(receipt.id);
      setExpenses(receiptExpenses);
    } else {
      setExpenses([]);
    }
  };

  const pollReceiptStatus = useCallback(async (receiptId: string) => {
    try {
      const response = await fetch(`/api/receipts/${receiptId}/status`);
      if (!response.ok) {
        throw new Error('Failed to get receipt status.');
      }
      const data = await response.json();

      if (data.status === 'completed') {
        setStatus('success');
        setCurrentJobId(null);
        toast({
          title: 'Processing Complete',
          description: 'Your receipt has been successfully processed.',
        });
        await fetchReceipts(); // Refresh the list
        const newlyProcessedReceipt = await getReceiptsForUser((await supabase.auth.getUser()).data.user!.id)
            .then(r => r.find(rec => rec.id === receiptId));
        if (newlyProcessedReceipt) {
            await handleSelectReceipt(newlyProcessedReceipt);
        }
      } else if (data.status === 'failed') {
        setStatus('error');
        setError(data.errorMessage || 'An unknown error occurred.');
        setCurrentJobId(null);
        toast({
          title: 'Processing Failed',
          description: data.errorMessage || 'An unknown error occurred.',
          variant: 'destructive',
        });
        await fetchReceipts();
      } else {
        // If still processing, poll again after a delay
        setTimeout(() => pollReceiptStatus(receiptId), 3000);
      }
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      setCurrentJobId(null);
      toast({
        title: 'Error',
        description: 'Could not check receipt status.',
        variant: 'destructive',
      });
    }
  }, [toast, fetchReceipts, supabase.auth]);


  useEffect(() => {
    if (currentJobId) {
      pollReceiptStatus(currentJobId);
    }
  }, [currentJobId, pollReceiptStatus]);

  const handleUploadComplete = async (receiptId: string, storagePath: string) => {
    setStatus('polling');
    setError(null);
    setSelectedReceipt(null);
    setExpenses([]);
    
    toast({
      title: 'Upload Successful',
      description: 'Your receipt is now being processed in the background.',
    });

    await fetchReceipts(); // Show the new 'pending' receipt immediately

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const response = await fetch('/api/trigger-processing', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ receiptId, storagePath }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to start processing job.');
        }
        
        setCurrentJobId(receiptId);

    } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        toast({
            title: 'Error',
            description: 'Could not start the processing job.',
            variant: 'destructive',
        });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Upload Receipt</h2>
            <UploadDropzone onUploadComplete={handleUploadComplete} />
            <div className="mt-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">History</h2>
              <div className="space-y-2">
                {receipts.map((receipt) => (
                  <ReceiptCard
                    key={receipt.id}
                    receipt={receipt}
                    isSelected={selectedReceipt?.id === receipt.id}
                    onSelect={() => handleSelectReceipt(receipt)}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Extracted Expenses</h2>
            <div className="bg-white p-6 rounded-lg shadow-md">
              {selectedReceipt ? (
                <div>
                  <h3 className="text-lg font-semibold">{selectedReceipt.filename}</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Status: <span className={`font-medium ${
                      selectedReceipt.status === 'completed' ? 'text-green-600' :
                      selectedReceipt.status === 'failed' ? 'text-red-600' : 'text-yellow-600'
                    }`}>{selectedReceipt.status}</span>
                  </p>
                  {selectedReceipt.status === 'completed' && expenses.length > 0 && (
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Page</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {expenses.map((expense) => (
                          <tr key={expense.id}>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-800">{expense.description}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-800">{expense.amount.toFixed(2)}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{expense.category}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{expense.page_number}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {selectedReceipt.status === 'processing' && (
                     <div className="text-center py-8">
                        <p className="text-gray-600">Processing... Please wait.</p>
                     </div>
                  )}
                   {selectedReceipt.status === 'pending' && (
                     <div className="text-center py-8">
                        <p className="text-gray-600">Waiting to be processed.</p>
                     </div>
                  )}
                  {selectedReceipt.status === 'failed' && (
                    <div className="text-center py-8 text-red-600">
                        <p>Processing failed: {selectedReceipt.error_message}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-600">Upload a receipt or select one from the history to view details.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
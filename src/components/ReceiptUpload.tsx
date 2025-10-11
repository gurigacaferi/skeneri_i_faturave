"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { Loader2, UploadCloud, CheckCircle2, Link, Download } from 'lucide-react';
import ExpenseSplitterDialog from './ExpenseSplitterDialog';
import { exportExpensesToCsv } from '@/utils/exportToCsv';

interface ReceiptUploadProps {
  onReceiptProcessed: () => void;
  selectedBatchId: string | null;
}

const ReceiptUpload: React.FC<ReceiptUploadProps> = ({ onReceiptProcessed, selectedBatchId }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const { session, supabase } = useSession();

  const [isSplitterDialogOpen, setIsSplitterDialogOpen] = useState(false);
  const [extractedExpenses, setExtractedExpenses] = useState<any[] | null>(null);
  const [currentReceiptId, setCurrentReceiptId] = useState<string | null>(null);

  const [isConnectedToQuickBooks, setIsConnectedToQuickBooks] = useState(false);
  const [connectingQuickBooks, setConnectingQuickBooks] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpeg', '.jpg'],
      'image/png': ['.png'],
      'application/pdf': ['.pdf'],
    },
    multiple: false,
  });

  const checkQuickBooksConnection = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase
      .from('quickbooks_integrations')
      .select('id')
      .eq('user_id', session.user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking QuickBooks connection:', error.message);
      setIsConnectedToQuickBooks(false);
    } else if (data) {
      setIsConnectedToQuickBooks(true);
    } else {
      setIsConnectedToQuickBooks(false);
    }
  }, [session, supabase]);

  useEffect(() => {
    checkQuickBooksConnection();
  }, [checkQuickBooksConnection]);

  const handleFileUpload = async () => {
    if (!file) {
      showError('Please select a file to upload.');
      return;
    }

    if (!session) {
      showError('You must be logged in to upload receipts.');
      return;
    }

    if (!selectedBatchId) {
      showError('Please select or create an expense batch before uploading receipts.');
      return;
    }

    setLoading(true);
    const toastId = showLoading('Processing receipt with AI...');

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64Image = reader.result as string;

        const { data, error } = await supabase.functions.invoke('process-receipt', {
          body: { base64Image, filename: file.name, batchId: selectedBatchId },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (error) {
          console.error('Supabase Function Invoke Error:', error);
          throw new Error(error.message || 'Failed to process receipt with AI.');
        }

        dismissToast(toastId);
        showSuccess('Receipt processed by AI. Please review and save expenses.');
        setFile(null);

        setExtractedExpenses(data.expenses);
        setCurrentReceiptId(data.receiptId);
        setIsSplitterDialogOpen(true);
      };
      reader.onerror = (error) => {
        throw new Error('Failed to read file: ' + error);
      };
    } catch (error: any) {
      dismissToast(toastId);

      let errorMessage = 'An unexpected error occurred.';
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        errorMessage = 'Network error: Could not connect to the server. Please check your internet connection or try again later.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      showError(errorMessage);
      console.error('Receipt upload error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExpensesSaved = () => {
    setIsSplitterDialogOpen(false);
    setExtractedExpenses(null);
    setCurrentReceiptId(null);
    onReceiptProcessed();
  };

  const handleConnectQuickBooks = async () => {
    if (!session) {
      showError('You must be logged in to connect to QuickBooks.');
      return;
    }
    setConnectingQuickBooks(true);
    const toastId = showLoading('Initiating QuickBooks connection...');

    try {
      const response = await fetch(
        `https://azkeakdwogyoajsmdhdq.supabase.co/functions/v1/quickbooks-oauth/initiate`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to initiate QuickBooks connection.');
      }

      dismissToast(toastId);
      window.location.href = data.authorizeUrl;
    } catch (error: any) {
      dismissToast(toastId);
      showError('Failed to connect to QuickBooks: ' + error.message);
      console.error('QuickBooks connection error:', error);
    } finally {
      setConnectingQuickBooks(false);
    }
  };

  const handleExportBatchToCsv = async () => {
    if (!session) {
      showError('You must be logged in to export expenses.');
      return;
    }
    if (!selectedBatchId) {
      showError('Please select or create an expense batch first.');
      return;
    }

    setExportingCsv(true);
    const toastId = showLoading('Preparing CSV export...');

    try {
      const { data: expenses, error: expensesError } = await supabase
        .from('expenses')
        .select('id, name, category, amount, date, merchant, tvsh_percentage, vat_code, created_at')
        .eq('batch_id', selectedBatchId)
        .eq('user_id', session.user.id);

      if (expensesError) {
        throw new Error(expensesError.message);
      }

      if (!expenses || expenses.length === 0) {
        showError('No expenses found in the current batch to export.');
        return;
      }

      const { data: batchData, error: batchError } = await supabase
        .from('expense_batches')
        .select('name')
        .eq('id', selectedBatchId)
        .single();

      if (batchError) {
        console.error('Error fetching batch name:', batchError.message);
      }

      const batchName = batchData ? batchData.name : 'Current_Batch';

      exportExpensesToCsv(expenses, batchName);
      showSuccess('Expenses exported to CSV successfully!');
    } catch (error: any) {
      showError('Failed to export expenses to CSV: ' + error.message);
      console.error('CSV export error:', error);
    } finally {
      dismissToast(toastId);
      setExportingCsv(false);
    }
  };

  return (
    <>
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Upload Receipt</CardTitle>
          <CardDescription>Drag and drop your receipt image or PDF here, or click to select a file.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
          >
            <input {...getInputProps()} />
            {isDragActive ? (
              <p className="text-gray-600 dark:text-gray-400">Drop the files here ...</p>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-2">
                <UploadCloud className="h-12 w-12 text-gray-400 dark:text-gray-500" />
                <p className="text-gray-600 dark:text-gray-400">
                  Drag 'n' drop a receipt image or PDF here, or click to select one
                </p>
                {file && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Selected file: {file.name}</p>
                )}
              </div>
            )}
          </div>
          <Button
            onClick={handleFileUpload}
            className="w-full mt-6"
            disabled={!file || loading || !selectedBatchId}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              'Process Receipt'
            )}
          </Button>
          {!selectedBatchId && (
            <p className="text-sm text-red-500 mt-2 text-center">Please select or create an expense batch.</p>
          )}

          <div className="flex flex-wrap gap-4 mt-6 justify-center">
            <Button
              onClick={handleConnectQuickBooks}
              variant={isConnectedToQuickBooks ? 'secondary' : 'default'}
              disabled={connectingQuickBooks}
            >
              {connectingQuickBooks ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : isConnectedToQuickBooks ? (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              ) : (
                <Link className="mr-2 h-4 w-4" />
              )}
              {isConnectedToQuickBooks ? 'QuickBooks Connected' : 'Connect to QuickBooks'}
            </Button>
            <Button
              onClick={handleExportBatchToCsv}
              disabled={!selectedBatchId || exportingCsv}
              variant="outline"
            >
              {exportingCsv ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Export Current Batch to CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <ExpenseSplitterDialog
        open={isSplitterDialogOpen}
        onOpenChange={setIsSplitterDialogOpen}
        initialExpenses={extractedExpenses}
        receiptId={currentReceiptId}
        batchId={selectedBatchId}
        onExpensesSaved={handleExpensesSaved}
      />
    </>
  );
};

export default ReceiptUpload;
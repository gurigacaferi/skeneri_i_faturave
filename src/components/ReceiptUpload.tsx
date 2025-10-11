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
import { DateRangePickerForExport } from './DateRangePickerForExport'; // Import the new component
import { format } from 'date-fns';

interface ReceiptUploadProps {
  onReceiptProcessed: () => void;
  selectedBatchId: string | null;
}

// Define a type for expenses extracted from a single receipt, including its receiptId
interface ExtractedExpenseWithReceiptId {
  receiptId: string;
  expense: {
    name: string;
    category: string;
    amount: number;
    date: string;
    merchant: string | null;
    tvsh_percentage: number;
    vat_code: string;
  };
}

const ReceiptUpload: React.FC<ReceiptUploadProps> = ({ onReceiptProcessed, selectedBatchId }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const { session, supabase } = useSession();

  const [isSplitterDialogOpen, setIsSplitterDialogOpen] = useState(false);
  const [allExtractedExpensesForDialog, setAllExtractedExpensesForDialog] = useState<ExtractedExpenseWithReceiptId[] | null>(null);

  const [isConnectedToQuickBooks, setIsConnectedToQuickBooks] = useState(false);
  const [connectingQuickBooks, setConnectingQuickBooks] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportDateRange, setExportDateRange] = useState<{ from: Date | undefined; to: Date | undefined; label: string }>({
    from: undefined,
    to: undefined,
    label: "Select Range",
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(acceptedFiles);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpeg', '.jpg'],
      'image/png': ['.png'],
      'application/pdf': ['.pdf'],
    },
    multiple: true, // Allow multiple files
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
    if (files.length === 0) {
      showError('Please select at least one file to upload.');
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
    const toastId = showLoading(`Processing ${files.length} receipt(s) with AI...`);
    const processedExpenses: ExtractedExpenseWithReceiptId[] = [];
    let hasError = false;

    for (const file of files) {
      try {
        const base64Image = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = (error) => reject(new Error('Failed to read file: ' + error));
        });

        const { data, error } = await supabase.functions.invoke('process-receipt', {
          body: { base64Image, filename: file.name, batchId: selectedBatchId },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (error) {
          console.error(`Supabase Function Invoke Error for ${file.name}:`, error);
          throw new Error(error.message || `Failed to process receipt ${file.name} with AI.`);
        }

        if (data.expenses && Array.isArray(data.expenses)) {
          data.expenses.forEach((exp: any) => {
            processedExpenses.push({ receiptId: data.receiptId, expense: exp });
          });
        }
      } catch (error: any) {
        hasError = true;
        let errorMessage = `Failed to process ${file.name}: `;
        if (error instanceof TypeError && error.message === 'Failed to fetch') {
          errorMessage += 'Network error. Please check your internet connection.';
        } else if (error.message) {
          errorMessage += error.message;
        }
        showError(errorMessage);
        console.error(`Error processing ${file.name}:`, error);
      }
    }

    dismissToast(toastId);
    setLoading(false);
    setFiles([]); // Clear selected files

    if (hasError && processedExpenses.length === 0) {
      showError('No receipts were processed successfully.');
      return;
    } else if (hasError) {
      showSuccess('Some receipts were processed. Please review the extracted expenses.');
    } else {
      showSuccess('All receipts processed by AI. Please review and save expenses.');
    }

    setAllExtractedExpensesForDialog(processedExpenses);
    setIsSplitterDialogOpen(true);
  };

  const handleExpensesSaved = () => {
    setIsSplitterDialogOpen(false);
    setAllExtractedExpensesForDialog(null);
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

  const handleExportExpenses = async () => {
    if (!session) {
      showError('You must be logged in to export expenses.');
      return;
    }
    if (!exportDateRange.from || !exportDateRange.to) {
      showError('Please select a valid date range for export.');
      return;
    }

    setExportingCsv(true);
    const toastId = showLoading('Preparing CSV export...');

    try {
      let query = supabase
        .from('expenses')
        .select('id, name, category, amount, date, merchant, tvsh_percentage, vat_code, created_at')
        .eq('user_id', session.user.id)
        .gte('date', format(exportDateRange.from, 'yyyy-MM-dd'))
        .lte('date', format(exportDateRange.to, 'yyyy-MM-dd'))
        .order('date', { ascending: false });

      const { data: expenses, error: expensesError } = await query;

      if (expensesError) {
        throw new Error(expensesError.message);
      }

      if (!expenses || expenses.length === 0) {
        showError('No expenses found for the selected date range to export.');
        return;
      }

      const exportFileName = `Expenses_${exportDateRange.label.replace(/\s/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmmss')}`;
      exportExpensesToCsv(expenses, exportFileName);
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
          <CardDescription>Drag and drop your receipt image(s) or PDF(s) here, or click to select files.</CardDescription>
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
                  Drag 'n' drop receipt images or PDFs here, or click to select them
                </p>
                {files.length > 0 && (
                  <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Selected files: {files.map(f => f.name).join(', ')}
                  </div>
                )}
              </div>
            )}
          </div>
          <Button
            onClick={handleFileUpload}
            className="w-full mt-6"
            disabled={files.length === 0 || loading || !selectedBatchId}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              `Process ${files.length} Receipt(s)`
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
            <div className="flex flex-col gap-2 w-full sm:w-auto">
              <DateRangePickerForExport onDateRangeChange={setExportDateRange} />
              <Button
                onClick={handleExportExpenses}
                disabled={!exportDateRange.from || !exportDateRange.to || exportingCsv}
                variant="outline"
                className="w-full"
              >
                {exportingCsv ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Export Expenses to CSV
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ExpenseSplitterDialog
        open={isSplitterDialogOpen}
        onOpenChange={setIsSplitterDialogOpen}
        initialExpenses={allExtractedExpensesForDialog}
        batchId={selectedBatchId}
        onExpensesSaved={handleExpensesSaved}
      />
    </>
  );
};

export default ReceiptUpload;
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
import { DateRangePickerForExport } from './DateRangePickerForExport';
import { format } from 'date-fns';

interface ReceiptUploadProps {
  onReceiptProcessed: () => void;
  selectedBatchId: string | null;
}

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
    multiple: true,
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
    if (!session || !selectedBatchId) {
      showError('You must be logged in and have a batch selected.');
      return;
    }

    setLoading(true);
    const toastId = showLoading(`Processing ${files.length} receipt(s)...`);
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
        });

        if (error) throw new Error(error.message || `Failed to process receipt ${file.name}.`);
        if (data.expenses) {
          data.expenses.forEach((exp: any) => processedExpenses.push({ receiptId: data.receiptId, expense: exp }));
        }
      } catch (error: any) {
        hasError = true;
        showError(`Failed to process ${file.name}: ${error.message}`);
      }
    }

    dismissToast(toastId);
    setLoading(false);
    setFiles([]);

    if (processedExpenses.length > 0) {
      showSuccess(hasError ? 'Some receipts were processed.' : 'All receipts processed!');
      setAllExtractedExpensesForDialog(processedExpenses);
      setIsSplitterDialogOpen(true);
    } else if (!hasError) {
      showError('AI could not extract any expenses from the uploaded files.');
    }
  };

  const handleExpensesSaved = () => {
    setIsSplitterDialogOpen(false);
    setAllExtractedExpensesForDialog(null);
    onReceiptProcessed();
  };

  const handleConnectQuickBooks = async () => {
    if (!session) return;
    setConnectingQuickBooks(true);
    const toastId = showLoading('Initiating QuickBooks connection...');
    try {
      const { data, error } = await supabase.functions.invoke('quickbooks-oauth', {
        body: { action: 'initiate' },
      });
      if (error) throw new Error(error.message);
      dismissToast(toastId);
      window.location.href = data.authorizeUrl;
    } catch (error: any) {
      dismissToast(toastId);
      showError('Failed to connect to QuickBooks: ' + error.message);
    } finally {
      setConnectingQuickBooks(false);
    }
  };

  const handleExportExpenses = async () => {
    if (!session || !exportDateRange.from || !exportDateRange.to) {
      showError('Please log in and select a valid date range for export.');
      return;
    }
    setExportingCsv(true);
    const toastId = showLoading('Preparing CSV export...');
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('id, name, category, amount, date, merchant, tvsh_percentage, vat_code, created_at')
        .eq('user_id', session.user.id)
        .gte('date', format(exportDateRange.from, 'yyyy-MM-dd'))
        .lte('date', format(exportDateRange.to, 'yyyy-MM-dd'))
        .order('date', { ascending: false });
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        showError('No expenses found for the selected date range.');
        return;
      }
      const fileName = `Expenses_${exportDateRange.label.replace(/\s/g, '_')}_${format(new Date(), 'yyyyMMdd')}`;
      exportExpensesToCsv(data, fileName);
      showSuccess('Expenses exported successfully!');
    } catch (error: any) {
      showError('Failed to export expenses: ' + error.message);
    } finally {
      dismissToast(toastId);
      setExportingCsv(false);
    }
  };

  return (
    <>
      <Card className="w-full max-w-3xl mx-auto shadow-lg shadow-black/5 border-0">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Upload Your Receipts</CardTitle>
          <CardDescription>Drag and drop your receipt image(s) or PDF(s) below.</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div
            {...getRootProps()}
            className="border-2 border-dashed border-primary/30 rounded-lg p-10 text-center cursor-pointer hover:border-primary transition-colors bg-gradient-to-br from-background to-secondary/50"
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center justify-center space-y-4 text-foreground/70">
              <UploadCloud className="h-12 w-12 text-primary/80" />
              {isDragActive ? (
                <p>Drop the files here ...</p>
              ) : (
                <p>
                  Drag 'n' drop files here, or click to select
                </p>
              )}
              {files.length > 0 && (
                <div className="mt-2 text-sm">
                  Selected: {files.map(f => f.name).join(', ')}
                </div>
              )}
            </div>
          </div>
          <Button
            onClick={handleFileUpload}
            className="w-full mt-6 h-12 text-lg font-semibold"
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
            <p className="text-sm text-destructive mt-2 text-center">Please select or create an expense batch.</p>
          )}

          <div className="flex flex-col sm:flex-row items-center gap-4 mt-8 pt-6 border-t">
            <div className="flex-1 w-full">
              <Button
                onClick={handleConnectQuickBooks}
                variant={isConnectedToQuickBooks ? 'secondary' : 'outline'}
                disabled={connectingQuickBooks}
                className="w-full"
              >
                {connectingQuickBooks ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : isConnectedToQuickBooks ? (
                  <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                ) : (
                  <Link className="mr-2 h-4 w-4" />
                )}
                {isConnectedToQuickBooks ? 'QuickBooks Connected' : 'Connect to QuickBooks'}
              </Button>
            </div>
            <div className="flex-1 w-full flex flex-col gap-2">
              <DateRangePickerForExport onDateRangeChange={setExportDateRange} />
              <Button
                onClick={handleExportExpenses}
                disabled={!exportDateRange.from || !exportDateRange.to || exportingCsv}
                variant="outline"
                className="w-full"
              >
                {exportingCsv ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Export to CSV
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
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { Loader2, UploadCloud, CheckCircle2, Link, FileText, X, Image, File as FileIcon } from 'lucide-react';
import ExpenseSplitterDialog from './ExpenseSplitterDialog';
import { v4 as uuidv4 } from 'uuid';

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

interface UploadedFile extends File {
  id: string;
}

const ReceiptUpload: React.FC<ReceiptUploadProps> = ({ onReceiptProcessed, selectedBatchId }) => {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const { session, supabase } = useSession();

  const [isSplitterDialogOpen, setIsSplitterDialogOpen] = useState(false);
  const [allExtractedExpensesForDialog, setAllExtractedExpensesForDialog] = useState<ExtractedExpenseWithReceiptId[] | null>(null);

  const [isConnectedToQuickBooks, setIsConnectedToQuickBooks] = useState(false);
  const [connectingQuickBooks, setConnectingQuickBooks] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: UploadedFile[] = acceptedFiles.map(file => Object.assign(file, { id: uuidv4() }));
    setFiles(prevFiles => [...prevFiles, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.png', '.gif', '.bmp', '.webp', '.heic', '.heif'],
      'application/pdf': ['.pdf'],
    },
    multiple: true,
  });

  const handleRemoveFile = (fileId: string) => {
    setFiles(prevFiles => prevFiles.filter(file => file.id !== fileId));
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return <Image className="h-5 w-5 text-primary" />;
    if (fileType === 'application/pdf') return <FileIcon className="h-5 w-5 text-red-500" />;
    return <FileText className="h-5 w-5 text-gray-500" />;
  };

  const checkQuickBooksConnection = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from('quickbooks_integrations')
      .select('id')
      .eq('user_id', session.user.id)
      .single();
    setIsConnectedToQuickBooks(!!data);
  }, [session, supabase]);

  useEffect(() => {
    checkQuickBooksConnection();
  }, [checkQuickBooksConnection]);

  const handleFileUpload = async () => {
    if (files.length === 0) { showError('Please select at least one file.'); return; }
    if (!session || !selectedBatchId) { showError('You must be logged in and have a batch selected.'); return; }

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
          reader.onerror = (error) => reject(error);
        });

        const { data, error } = await supabase.functions.invoke('process-receipt', {
          body: { base64Image, filename: file.name, batchId: selectedBatchId },
        });

        if (error) throw new Error(error.message);
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
      const { data, error } = await supabase.functions.invoke('quickbooks-oauth/initiate');
      if (error) throw new Error(error.message);
      window.location.href = data.authorizeUrl;
    } catch (error: any) {
      showError('Failed to connect to QuickBooks: ' + error.message);
    } finally {
      dismissToast(toastId);
      setConnectingQuickBooks(false);
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
          <div {...getRootProps()} className="border-2 border-dashed border-primary/30 rounded-lg p-10 text-center cursor-pointer hover:border-primary transition-colors bg-gradient-to-br from-background to-secondary/50">
            <input {...getInputProps()} />
            <div className="flex flex-col items-center justify-center space-y-4 text-foreground/70">
              <UploadCloud className="h-12 w-12 text-primary/80" />
              <p>{isDragActive ? "Drop the files here..." : "Drag 'n' drop files here, or click to select"}</p>
            </div>
          </div>
          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium text-foreground/80">Selected Files:</p>
              {files.map(file => (
                <div key={file.id} className="flex items-center justify-between p-2 border rounded-md bg-secondary/30">
                  <div className="flex items-center space-x-2">
                    {getFileIcon(file.type)}
                    <span className="text-sm text-foreground/90">{file.name}</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleRemoveFile(file.id); }} className="h-6 w-6 text-foreground/60 hover:text-destructive">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Button onClick={handleFileUpload} className="w-full mt-6 h-12 text-lg font-semibold" disabled={files.length === 0 || loading || !selectedBatchId}>
            {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>) : (`Process ${files.length} Receipt(s)`)}
          </Button>
          {!selectedBatchId && (<p className="text-sm text-destructive mt-2 text-center">Please select or create an expense batch.</p>)}

          <div className="mt-8 pt-6 border-t">
            <Button onClick={handleConnectQuickBooks} variant={isConnectedToQuickBooks ? 'secondary' : 'outline'} disabled={connectingQuickBooks} className="w-full">
              {connectingQuickBooks ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : isConnectedToQuickBooks ? <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" /> : <Link className="mr-2 h-4 w-4" />}
              {isConnectedToQuickBooks ? 'QuickBooks Connected' : 'Connect to QuickBooks'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ExpenseSplitterDialog
        open={isSplitterDialogOpen}
        onOpenChange={setIsSplitterDialogOpen}
        initialExpenses={allExtractedExpensesForDialog}
        batchId={selectedBatchId}
        onExpensesSaved={handleExpensesSaved}
        isConnectedToQuickBooks={isConnectedToQuickBooks}
      />
    </>
  );
};

export default ReceiptUpload;
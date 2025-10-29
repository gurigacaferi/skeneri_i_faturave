"use client";

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { Loader2, UploadCloud, X, Image, File as FileIcon, CheckCircle, AlertTriangle } from 'lucide-react';
import ExpenseSplitterDialog from './ExpenseSplitterDialog';
import { v4 as uuidv4 } from 'uuid';
import { Progress } from '@/components/ui/progress'; // Import Progress component

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
  status: 'pending' | 'uploading' | 'processing' | 'processed' | 'failed';
  progress: number;
  receiptId?: string;
  errorMessage?: string;
}

const ReceiptUpload: React.FC<ReceiptUploadProps> = ({ onReceiptProcessed, selectedBatchId }) => {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const { session, supabase } = useSession();

  const [isSplitterDialogOpen, setIsSplitterDialogOpen] = useState(false);
  const [allExtractedExpensesForDialog, setAllExtractedExpensesForDialog] = useState<ExtractedExpenseWithReceiptId[] | null>(null);

  const updateFileState = useCallback((fileId: string, updates: Partial<UploadedFile>) => {
    setFiles(prevFiles =>
      prevFiles.map(file =>
        file.id === fileId ? { ...file, ...updates } : file
      )
    );
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: UploadedFile[] = acceptedFiles.map(file => Object.assign(file, { 
      id: uuidv4(), 
      status: 'pending', 
      progress: 0,
      errorMessage: undefined,
    })) as UploadedFile[];
    setFiles(prevFiles => [...prevFiles, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/webp': ['.webp'],
      'application/pdf': ['.pdf'],
      'image/gif': ['.gif'],
      'image/bmp': ['.bmp'],
      'image/heic': ['.heic'],
      'image/heif': ['.heif'],
    },
    multiple: true,
  });

  const handleRemoveFile = (fileId: string) => {
    setFiles(prevFiles => prevFiles.filter(file => file.id !== fileId));
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return <Image className="h-5 w-5 text-primary" />;
    if (fileType === 'application/pdf') return <FileIcon className="h-5 w-5 text-red-500" />;
    return <FileIcon className="h-5 w-5 text-gray-500" />;
  };

  const handleFileUpload = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending' || f.status === 'failed');
    if (pendingFiles.length === 0) { showError('No files selected or pending processing.'); return; }
    if (!session || !selectedBatchId) { showError('You must be logged in and have a batch selected.'); return; }

    setIsUploading(true);
    const toastId = showLoading(`Starting processing for ${pendingFiles.length} receipt(s)...`);
    const processedExpenses: ExtractedExpenseWithReceiptId[] = [];
    let hasError = false;

    for (const file of pendingFiles) {
      updateFileState(file.id, { status: 'uploading', progress: 5, errorMessage: undefined });
      let receiptId: string | undefined;
      
      try {
        // 1. Upload file to Supabase Storage (30% progress)
        const fileExtension = file.name.split('.').pop();
        const storagePath = `${session.user.id}/${uuidv4()}.${fileExtension}`;

        const { error: storageError } = await supabase.storage
          .from('receipts')
          .upload(storagePath, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (storageError) throw new Error(`Storage upload failed: ${storageError.message}`);
        updateFileState(file.id, { progress: 30 });

        // 2. Insert receipt record with storage path (10% progress)
        const { data: receiptData, error: receiptInsertError } = await supabase
          .from('receipts')
          .insert({ 
            user_id: session.user.id, 
            filename: file.name, 
            batch_id: selectedBatchId,
            storage_path: storagePath,
            status: 'processing'
          })
          .select('id')
          .single();

        if (receiptInsertError) throw new Error(`DB insert failed: ${receiptInsertError.message}`);
        receiptId = receiptData.id;
        updateFileState(file.id, { progress: 40, receiptId, status: 'processing' });

        // 3. Read file to base64 for AI processing
        const base64Image = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = (error) => reject(error);
        });

        // 4. Invoke Edge Function with base64 image (50% progress)
        const { data, error: edgeFunctionError } = await supabase.functions.invoke('process-receipt', {
          body: { base64Image, filename: file.name, batchId: selectedBatchId, receiptId },
        });
        
        updateFileState(file.id, { progress: 90 });

        if (edgeFunctionError) throw new Error(edgeFunctionError.message);
        if (data.expenses) {
          data.expenses.forEach((exp: any) => processedExpenses.push({ receiptId: receiptId!, expense: exp }));
        }
        
        // 5. Update receipt status to processed (10% progress)
        await supabase.from('receipts').update({ status: 'processed' }).eq('id', receiptId);
        updateFileState(file.id, { progress: 100, status: 'processed' });

      } catch (error: any) {
        hasError = true;
        const errorMessage = error.message || 'Unknown error during processing.';
        updateFileState(file.id, { status: 'failed', progress: 100, errorMessage });
        
        // If processing failed, mark receipt as failed if it was created
        if (receiptId) {
            await supabase.from('receipts').update({ status: 'failed' }).eq('id', receiptId);
        }
      }
    }

    dismissToast(toastId);
    setIsUploading(false);

    if (processedExpenses.length > 0) {
      showSuccess(hasError ? 'Some receipts were processed successfully.' : 'All receipts processed!');
      setAllExtractedExpensesForDialog(processedExpenses);
      setIsSplitterDialogOpen(true);
    } else if (!hasError) {
      showError('AI could not extract any expenses from the uploaded files.');
    }
    
    // Trigger a refresh in the parent component (ExpensesList)
    onReceiptProcessed();
  };

  const handleExpensesSaved = () => {
    setIsSplitterDialogOpen(false);
    setAllExtractedExpensesForDialog(null);
    // Clear only successfully processed files from the list
    setFiles(prevFiles => prevFiles.filter(f => f.status === 'failed'));
    onReceiptProcessed();
  };

  const totalProgress = files.length > 0 
    ? files.reduce((sum, file) => sum + file.progress, 0) / files.length 
    : 0;

  return (
    <>
      <Card className="w-full max-w-3xl mx-auto shadow-lg shadow-black/5 border-0">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Upload Your Receipts</CardTitle>
          <CardDescription>Drag and drop your receipt image(s) or PDF(s) below.</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div {...getRootProps()} className="border-2 border-dashed border-primary/30 rounded-lg p-10 text-center cursor-pointer hover:border-primary transition-colors bg-gradient-to-br from-background to-secondary/50" aria-disabled={isUploading}>
            <input {...getInputProps()} disabled={isUploading} />
            <div className="flex flex-col items-center justify-center space-y-4 text-foreground/70">
              <UploadCloud className="h-12 w-12 text-primary/80" />
              <p>{isDragActive ? "Drop the files here..." : "Drag 'n' drop files here, or click to select"}</p>
            </div>
          </div>
          
          {files.length > 0 && (
            <div className="mt-6 space-y-4">
              <p className="text-sm font-medium text-foreground/80">Processing Queue:</p>
              
              {/* Overall Progress Bar */}
              {isUploading && (
                <div className="space-y-2">
                  <Progress value={totalProgress} className="h-2" />
                  <p className="text-sm text-muted-foreground text-center">Overall Progress: {Math.round(totalProgress)}%</p>
                </div>
              )}

              {/* Individual File Status */}
              {files.map(file => (
                <div key={file.id} className="flex flex-col p-3 border rounded-md transition-colors" data-status={file.status}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 min-w-0">
                      {getFileIcon(file.type)}
                      <span className="text-sm font-medium truncate">{file.name}</span>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      {file.status === 'pending' && (
                        <span className="text-xs text-muted-foreground">Ready</span>
                      )}
                      {file.status === 'uploading' && (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      )}
                      {file.status === 'processing' && (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      )}
                      {file.status === 'processed' && (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                      {file.status === 'failed' && (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      )}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={(e) => { e.stopPropagation(); handleRemoveFile(file.id); }} 
                        className="h-6 w-6 text-foreground/60 hover:text-destructive"
                        disabled={isUploading}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Progress Bar for active files */}
                  {(file.status === 'uploading' || file.status === 'processing') && (
                    <Progress value={file.progress} className="h-1 mt-2" />
                  )}
                  
                  {/* Error Message */}
                  {file.status === 'failed' && file.errorMessage && (
                    <p className="text-xs text-destructive mt-1 truncate">Error: {file.errorMessage}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          
          <Button onClick={handleFileUpload} className="w-full mt-6 h-12 text-lg font-semibold" disabled={pendingFiles.length === 0 || isUploading || !selectedBatchId}>
            {isUploading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>) : (`Process ${pendingFiles.length} Receipt(s)`)}
          </Button>
          {!selectedBatchId && (<p className="text-sm text-destructive mt-2 text-center">Please select or create an expense batch.</p>)}
        </CardContent>
      </Card>

      <ExpenseSplitterDialog
        open={isSplitterDialogOpen}
        onOpenChange={setIsSplitterDialogOpen}
        initialExpenses={allExtractedExpensesForDialog}
        batchId={selectedBatchId}
        onExpensesSaved={handleExpensesSaved}
        isConnectedToQuickBooks={false}
      />
    </>
  );
};

export default ReceiptUpload;
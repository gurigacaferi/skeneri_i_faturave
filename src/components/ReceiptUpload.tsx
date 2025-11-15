"use client";

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { Loader2, UploadCloud, X, Image, File as FileIcon, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import ExpenseSplitterDialog from './ExpenseSplitterDialog';
import { v4 as uuidv4 } from 'uuid';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface ReceiptUploadProps {
  onReceiptProcessed: () => void;
  selectedBatchId: string | null;
}

interface ExtractedExpenseWithReceiptId {
  receiptId: string;
  expense: any; // Simplified for this context
}

interface UploadedFile extends File {
  id: string;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed' | 'unsupported';
  receiptId?: string;
  errorMessage?: string;
}

const ACCEPTED_MIME_TYPES = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
};

const ReceiptUpload: React.FC<ReceiptUploadProps> = ({ onReceiptProcessed, selectedBatchId }) => {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const { session, supabase } = useSession();

  const [isSplitterDialogOpen, setIsSplitterDialogOpen] = useState(false);
  const [allExtractedExpensesForDialog, setAllExtractedExpensesForDialog] = useState<ExtractedExpenseWithReceiptId[] | null>([]);
  
  const pollingIntervalRef = useRef<number | null>(null);

  const filesToProcess = files.filter(f => f.status === 'pending');
  const processingFiles = files.filter(f => f.status === 'processing');

  const updateFileState = useCallback((fileId: string, updates: Partial<UploadedFile>) => {
    setFiles(prevFiles =>
      prevFiles.map(file =>
        file.id === fileId ? { ...file, ...updates } : file
      )
    );
  }, []);

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    const newAcceptedFiles: UploadedFile[] = acceptedFiles.map(file => Object.assign(file, { 
      id: uuidv4(), status: 'pending', errorMessage: undefined,
    })) as UploadedFile[];

    const newRejectedFiles: UploadedFile[] = fileRejections.map(({ file, errors }) => Object.assign(file, {
      id: uuidv4(), status: 'unsupported', errorMessage: errors[0]?.message || 'File type not supported.',
    })) as UploadedFile[];

    setFiles(prevFiles => [...prevFiles, ...newAcceptedFiles, ...newRejectedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_MIME_TYPES,
    multiple: true,
  });

  const handleRemoveFile = (fileId: string) => {
    setFiles(prevFiles => prevFiles.filter(file => file.id !== fileId));
  };

  const handleFileUpload = async () => {
    if (filesToProcess.length === 0) { showError('No files selected for processing.'); return; }
    if (!session || !selectedBatchId) { showError('You must be logged in and have a batch selected.'); return; }

    setIsUploading(true);
    const toastId = showLoading(`Uploading ${filesToProcess.length} receipt(s)...`);

    for (const file of filesToProcess) {
      updateFileState(file.id, { status: 'uploading', errorMessage: undefined });
      try {
        const fileExtension = file.name.split('.').pop();
        const storagePath = `${session.user.id}/${uuidv4()}.${fileExtension}`;
        
        const { error: storageError } = await supabase.storage.from('receipts').upload(storagePath, file);
        if (storageError) throw new Error(`Storage upload failed: ${storageError.message}`);

        const { data: receiptData, error: receiptInsertError } = await supabase
          .from('receipts')
          .insert({ 
            user_id: session.user.id, filename: file.name, batch_id: selectedBatchId,
            storage_path: storagePath, status: 'pending'
          })
          .select('id').single();
        if (receiptInsertError) throw new Error(`DB insert failed: ${receiptInsertError.message}`);
        
        const receiptId = receiptData.id;
        updateFileState(file.id, { receiptId, status: 'processing' });

        const { error: triggerError } = await supabase.functions.invoke('trigger-receipt-processing', {
          body: { receiptId, storagePath },
        });
        if (triggerError) throw new Error(`Job trigger failed: ${triggerError.message}`);

      } catch (error: any) {
        updateFileState(file.id, { status: 'failed', errorMessage: error.message });
      }
    }
    dismissToast(toastId);
    setIsUploading(false);
  };

  // Polling logic
  useEffect(() => {
    const pollStatuses = async () => {
      const processingReceiptIds = files
        .filter(f => f.status === 'processing' && f.receiptId)
        .map(f => f.receiptId!);

      if (processingReceiptIds.length === 0) {
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
        return;
      }

      const { data: updatedReceipts, error } = await supabase
        .from('receipts')
        .select('id, status, error_message')
        .in('id', processingReceiptIds)
        .in('status', ['completed', 'failed']);

      if (error) {
        console.error("Polling error:", error.message);
        return;
      }

      if (updatedReceipts && updatedReceipts.length > 0) {
        let allDone = true;
        files.forEach(file => {
          if (file.status === 'processing') {
            const updated = updatedReceipts.find(r => r.id === file.receiptId);
            if (updated) {
              updateFileState(file.id, { 
                status: updated.status as 'completed' | 'failed',
                errorMessage: updated.error_message,
              });
            } else {
              allDone = false;
            }
          }
        });

        if (allDone) {
          onReceiptProcessed();
          handleOpenSplitterDialog();
        }
      }
    };

    if (processingFiles.length > 0 && !pollingIntervalRef.current) {
      pollingIntervalRef.current = setInterval(pollStatuses, 5000); // Poll every 5 seconds
    } else if (processingFiles.length === 0 && pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [files, supabase, updateFileState, onReceiptProcessed]);

  const handleOpenSplitterDialog = async () => {
    const completedReceiptIds = files
      .filter(f => f.status === 'completed' && f.receiptId)
      .map(f => f.receiptId!);

    if (completedReceiptIds.length === 0) {
      showError("No receipts were processed successfully to review.");
      return;
    }

    const { data: expenses, error } = await supabase
      .from('expenses')
      .select('*')
      .in('receipt_id', completedReceiptIds);

    if (error) {
      showError(`Failed to fetch processed expenses: ${error.message}`);
      return;
    }

    const formattedForDialog = expenses.map(exp => ({
      receiptId: exp.receipt_id,
      expense: exp,
    }));

    setAllExtractedExpensesForDialog(formattedForDialog);
    setIsSplitterDialogOpen(true);
  };

  const handleExpensesSaved = () => {
    setIsSplitterDialogOpen(false);
    setAllExtractedExpensesForDialog(null);
    setFiles(prevFiles => prevFiles.filter(f => f.status === 'failed' || f.status === 'unsupported'));
    onReceiptProcessed();
  };

  const getFileIcon = (file: UploadedFile) => {
    switch(file.status) {
      case 'completed': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
      case 'unsupported': return <AlertTriangle className="h-5 w-5 text-destructive" />;
      case 'processing': return <Clock className="h-5 w-5 text-blue-500" />;
      case 'uploading': return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
      default:
        if (file.type.startsWith('image/')) return <Image className="h-5 w-5 text-primary" />;
        if (file.type === 'application/pdf') return <FileIcon className="h-5 w-5 text-red-500" />;
        return <FileIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  return (
    <>
      <Card className="w-full max-w-3xl mx-auto shadow-lg shadow-black/5 border-0">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Upload Your Receipts</CardTitle>
          <CardDescription>Processing happens in the background. You can safely leave this page.</CardDescription>
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
            <div className="mt-6 space-y-3">
              {files.map(file => (
                <div key={file.id} className="flex items-center p-3 border rounded-md">
                  <div className="flex-shrink-0 mr-3">{getFileIcon(file)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{file.status}</p>
                    {(file.status === 'failed' || file.status === 'unsupported') && file.errorMessage && (
                      <p className="text-xs text-destructive truncate">{file.errorMessage}</p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleRemoveFile(file.id)} className="h-7 w-7 text-foreground/60 hover:text-destructive" disabled={isUploading}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          
          <Button onClick={handleFileUpload} className="w-full mt-6 h-12 text-lg font-semibold" disabled={filesToProcess.length === 0 || isUploading || !selectedBatchId}>
            {isUploading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</>) : (`Process ${filesToProcess.length} Receipt(s)`)}
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
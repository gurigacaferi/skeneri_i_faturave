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
import { Progress } from '@/components/ui/progress';
import { fileToBase64Images } from '@/utils/fileUtils'; // Import the new utility
import { cn } from '@/lib/utils';

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
    pageNumber: number;
    nui: string | null;
    nr_fiskal: string | null;
    numri_i_tvsh_se: string | null;
    description: string | null;
    sasia: number | null;
    njesia: string | null;
  };
}

interface UploadedFile extends File {
  id: string;
  status: 'pending' | 'uploading' | 'processing' | 'processed' | 'failed' | 'unsupported';
  progress: number;
  receiptId?: string;
  errorMessage?: string;
  storagePath?: string; // Added storagePath to track where the file is saved
}

const ACCEPTED_MIME_TYPES = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
  'image/gif': ['.gif'],
  'image/bmp': ['.bmp'],
  'image/heic': ['.heic'],
  'image/heif': ['.heif'],
};

const ReceiptUpload: React.FC<ReceiptUploadProps> = ({ onReceiptProcessed, selectedBatchId }) => {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const { session, supabase } = useSession();

  const [isSplitterDialogOpen, setIsSplitterDialogOpen] = useState(false);
  const [allExtractedExpensesForDialog, setAllExtractedExpensesForDialog] = useState<ExtractedExpenseWithReceiptId[] | null>([]);

  // Only show files that are pending, failed, or unsupported in the queue
  const visibleFiles = files.filter(f => f.status !== 'processed');
  const filesToProcess = files.filter(f => f.status === 'pending');

  const updateFileState = useCallback((fileId: string, updates: Partial<UploadedFile>) => {
    setFiles(prevFiles =>
      prevFiles.map(file =>
        file.id === fileId ? { ...file, ...updates } : file
      )
    );
  }, []);

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    const newAcceptedFiles: UploadedFile[] = acceptedFiles.map(file => Object.assign(file, { 
      id: uuidv4(), 
      status: 'pending', 
      progress: 0,
      errorMessage: undefined,
    })) as UploadedFile[];

    const newRejectedFiles: UploadedFile[] = fileRejections.map(({ file, errors }) => Object.assign(file, {
      id: uuidv4(),
      status: 'unsupported',
      progress: 0,
      errorMessage: errors[0]?.message || 'File type not supported.',
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

  const getFileIcon = (fileType: string) => {
    if (typeof fileType === 'string' && fileType.startsWith('image/')) return <Image className="h-5 w-5 text-primary" />;
    if (fileType === 'application/pdf') return <FileIcon className="h-5 w-5 text-red-500" />;
    return <FileIcon className="h-5 w-5 text-gray-500" />;
  };

  const handleFileUpload = async () => {
    if (filesToProcess.length === 0) { showError('No files selected or pending processing.'); return; }
    if (!session || !selectedBatchId) { showError('You must be logged in and have a batch selected.'); return; }

    setIsUploading(true);
    const toastId = showLoading(`Starting processing for ${filesToProcess.length} receipt(s)...`);
    const allProcessedExpenses: ExtractedExpenseWithReceiptId[] = [];
    let hasError = false;

    for (const file of filesToProcess) {
      updateFileState(file.id, { status: 'uploading', progress: 5, errorMessage: undefined });
      let receiptId: string | undefined;
      
      try {
        // Step 1: Upload file to storage and create receipt record
        const fileExtension = file.name.split('.').pop();
        const storagePath = `${session.user.id}/${uuidv4()}.${fileExtension}`;
        const { error: storageError } = await supabase.storage.from('receipts').upload(storagePath, file);
        if (storageError) throw new Error(`Storage upload failed: ${storageError.message}`);
        updateFileState(file.id, { progress: 20, storagePath });

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
        updateFileState(file.id, { progress: 30, receiptId, status: 'processing' });

        // Step 2: Convert file to images for processing
        const base64Images = await fileToBase64Images(file);
        const totalPages = base64Images.length;
        updateFileState(file.id, { progress: 40 });

        // Step 3: Process each page individually
        for (let i = 0; i < totalPages; i++) {
          const pageImage = base64Images[i];
          const pageNumber = i + 1;
          
          const { data, error: edgeFunctionError } = await supabase.functions.invoke('process-receipt', {
            body: { base64Image: pageImage, receiptId, pageNumber },
          });

          if (edgeFunctionError) {
            throw new Error(`Failed to process page ${pageNumber}: ${edgeFunctionError.message}`);
          }

          if (data.expenses) {
            data.expenses.forEach((exp: any) => allProcessedExpenses.push({ receiptId: receiptId!, expense: exp }));
          }
          
          // Update progress after each page
          const progress = 40 + (50 * (pageNumber / totalPages));
          updateFileState(file.id, { progress });
        }
        
        // Step 4: Finalize
        await supabase.from('receipts').update({ status: 'processed' }).eq('id', receiptId);
        updateFileState(file.id, { progress: 100, status: 'processed' });

      } catch (error: any) {
        hasError = true;
        const errorMessage = error.message || 'Unknown error during processing.';
        updateFileState(file.id, { status: 'failed', progress: 100, errorMessage });
        if (receiptId) {
            await supabase.from('receipts').update({ status: 'failed' }).eq('id', receiptId);
        }
      }
    }

    dismissToast(toastId);
    setIsUploading(false);

    if (allProcessedExpenses.length > 0) {
      showSuccess(hasError ? 'Some receipts were processed successfully.' : 'All receipts processed!');
      setAllExtractedExpensesForDialog(allProcessedExpenses);
      setIsSplitterDialogOpen(true);
    } else if (!hasError) {
      showError('AI could not extract any expenses from the uploaded files.');
    }
    
    onReceiptProcessed();
  };

  const handleExpensesSaved = () => {
    setIsSplitterDialogOpen(false);
    setAllExtractedExpensesForDialog(null);
    // Only keep files that are in an error state (failed or unsupported).
    // All others (pending, uploading, processing, processed) are cleared.
    setFiles(prevFiles => prevFiles.filter(f => f.status === 'failed' || f.status === 'unsupported'));
    onReceiptProcessed();
  };

  const totalProgress = files.length > 0 
    ? files.reduce((sum, file) => file.status !== 'unsupported' ? sum + file.progress : sum, 0) / files.filter(f => f.status !== 'unsupported').length 
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
          
          {visibleFiles.length > 0 && (
            <div className="mt-6 space-y-4">
              <p className="text-sm font-medium text-foreground/80">Processing Queue:</p>
              
              {isUploading && (
                <div className="space-y-2">
                  <Progress value={totalProgress} className="h-2" />
                  <p className="text-sm text-muted-foreground text-center">Overall Progress: {Math.round(totalProgress)}%</p>
                </div>
              )}

              {visibleFiles.map(file => {
                const isUnsupported = file.status === 'unsupported';
                const isFailed = file.status === 'failed';
                const isErrorState = isUnsupported || isFailed;

                return (
                  <div 
                    key={file.id} 
                    className={cn(
                      "flex flex-col p-3 border rounded-md transition-colors",
                      isUnsupported && "border-destructive/50 bg-destructive/10 border-l-4 border-l-destructive",
                      isFailed && "border-destructive/50 bg-destructive/10 border-l-4 border-l-destructive",
                    )}
                    data-status={file.status}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3 min-w-0">
                        {isErrorState ? (
                          <X className="h-5 w-5 text-destructive" />
                        ) : (
                          getFileIcon(file.type)
                        )}
                        <span className={cn("text-sm font-medium truncate", isErrorState && "text-destructive")}>{file.name}</span>
                        <span className="text-xs text-muted-foreground">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
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
                        {isErrorState && (
                          <span className="text-xs text-destructive">Error</span>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={(e) => { e.stopPropagation(); handleRemoveFile(file.id); }} 
                          className="h-6 w-6 text-foreground/60 hover:text-destructive"
                          disabled={isUploading && !isErrorState}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    {(file.status === 'uploading' || file.status === 'processing') && (
                      <Progress value={file.progress} className="h-1 mt-2" />
                    )}
                    
                    {isErrorState && file.errorMessage && (
                      <p className="text-xs text-destructive mt-1 truncate">{file.errorMessage}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          
          <Button onClick={handleFileUpload} className="w-full mt-6 h-12 text-lg font-semibold" disabled={filesToProcess.length === 0 || isUploading || !selectedBatchId}>
            {isUploading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>) : (`Process ${filesToProcess.length} Receipt(s)`)}
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
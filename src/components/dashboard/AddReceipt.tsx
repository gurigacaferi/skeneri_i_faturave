import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Receipt, Expense } from '@/lib/types';
import { Loader2, UploadCloud, File as FileIcon, X } from 'lucide-react';

interface AddReceiptProps {
  onReceiptAdded: (receipt: Receipt, expenses: Expense[]) => void;
}

type ProcessingState = 'idle' | 'uploading' | 'processing_ai' | 'error';

export default function AddReceipt({ onReceiptAdded }: AddReceiptProps) {
  const [file, setFile] = useState<File | null>(null);
  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const supabase = getSupabaseBrowserClient();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      // Allow both PDF and common image types for flexibility
      if (selectedFile.type !== 'application/pdf' && !selectedFile.type.startsWith('image/')) {
        toast({
          variant: 'destructive',
          title: 'Invalid File Type',
          description: 'Please upload a PDF or an image file.',
        });
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 
      'application/pdf': ['.pdf'],
      'image/*': ['.jpeg', '.png', '.jpg'],
    },
    multiple: false,
  });

  const handleRemoveFile = () => {
    setFile(null);
    setError(null);
    setProcessingState('idle');
  };

  const processFile = async () => {
    if (!file || !user) return;

    setProcessingState('uploading');
    setError(null);

    try {
      // 1. Read the file into a base64 string
      const reader = new FileReader();
      reader.readAsDataURL(file);

      await new Promise<void>((resolve, reject) => {
        reader.onload = () => resolve();
        reader.onerror = (e) => reject(new Error(`Failed to read file: ${e}`));
      });

      const base64Image = reader.result as string;
      const base64Images = [base64Image]; // Wrap in array for the function

      // 2. Create a new receipt record in Supabase
      const { data: newReceipt, error: insertError } = await supabase
        .from('receipts')
        .insert({
          user_id: user.id,
          file_name: file.name,
          status: 'processing',
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(`Failed to create receipt record: ${insertError.message}`);
      }

      setProcessingState('processing_ai');

      // 3. Invoke the Supabase function
      const { data: expensesData, error: functionError } = await supabase.functions.invoke('process-receipt', {
        body: { base64Images, receiptId: newReceipt.id },
      });

      if (functionError) {
        throw new Error(`AI processing failed: ${functionError.message}`);
      }
      
      const { expenses } = expensesData;

      if (!expenses || expenses.length === 0) {
        toast({
          variant: 'default',
          title: 'No Expenses Found',
          description: 'The AI could not find any line items on your receipt. Please review it manually.',
        });
      }

      // 4. Update receipt status to 'processed'
      const { error: updateError } = await supabase
        .from('receipts')
        .update({ status: 'processed' })
        .eq('id', newReceipt.id);

      if (updateError) {
        console.error('Failed to update receipt status:', updateError.message);
      }

      onReceiptAdded(newReceipt, expenses);
      setFile(null);

    } catch (e: any) {
      console.error('Error processing file:', e);
      setError(`An error occurred: ${e.message}. The dashboard should now be stable. Please try a smaller file.`);
      setProcessingState('error');
      toast({
        variant: 'destructive',
        title: 'Processing Failed',
        description: e.message,
      });
    } finally {
      if (processingState !== 'error') {
        setProcessingState('idle');
      }
    }
  };

  const isLoading = processingState !== 'idle' && processingState !== 'error';
  
  const getLoadingMessage = () => {
    switch (processingState) {
      case 'uploading':
        return 'Reading file and preparing for upload...';
      case 'processing_ai':
        return 'AI is analyzing your receipt. This may take a moment...';
      default:
        return 'Processing...';
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Receipt</CardTitle>
        <CardDescription>Upload a PDF or image receipt to automatically extract expenses.</CardDescription>
      </CardHeader>
      <CardContent>
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        {!file && (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
              isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
            }`}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <UploadCloud className="w-12 h-12" />
              {isDragActive ? (
                <p>Drop the file here ...</p>
              ) : (
                <p>Drag 'n' drop a file here, or click to select file (PDF or Image)</p>
              )}
            </div>
          </div>
        )}

        {file && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <FileIcon className="w-6 h-6 text-primary" />
                <span className="font-medium">{file.name}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={handleRemoveFile} disabled={isLoading}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {isLoading ? (
              <div className="flex items-center gap-3 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{getLoadingMessage()}</span>
              </div>
            ) : (
              <Button onClick={processFile} className="w-full" disabled={isLoading}>
                Process Receipt
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
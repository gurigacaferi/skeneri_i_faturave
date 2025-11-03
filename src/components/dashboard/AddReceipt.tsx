import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Receipt, Expense } from '@/lib/types';
import { PDFDocument } from 'pdf-lib';
import { Loader2, UploadCloud, File as FileIcon, X } from 'lucide-react';

interface AddReceiptProps {
  onReceiptAdded: (receipt: Receipt, expenses: Expense[]) => void;
}

type ProcessingState = 'idle' | 'reading_file' | 'converting_pages' | 'processing_ai' | 'error';

export default function AddReceipt({ onReceiptAdded }: AddReceiptProps) {
  const [file, setFile] = useState<File | null>(null);
  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [processingMessage, setProcessingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const supabase = getSupabaseBrowserClient();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      if (selectedFile.type !== 'application/pdf') {
        toast({
          variant: 'destructive',
          title: 'Invalid File Type',
          description: 'Please upload a PDF file.',
        });
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
  });

  const handleRemoveFile = () => {
    setFile(null);
    setError(null);
    setProcessingState('idle');
  };

  const processPdf = async () => {
    if (!file || !user) return;

    setProcessingState('reading_file');
    setProcessingMessage('Reading PDF file...');
    setError(null);

    try {
      const fileBuffer = await file.arrayBuffer();
      
      // Create a new receipt record in Supabase first
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

      setProcessingState('converting_pages');
      setProcessingMessage('Loading PDF document...');
      
      const pdfDoc = await PDFDocument.load(fileBuffer);
      const numPages = pdfDoc.getPageCount();
      const base64Images: string[] = [];

      // Robustly render each page one by one
      for (let i = 0; i < numPages; i++) {
        setProcessingMessage(`Converting page ${i + 1} of ${numPages} to image...`);
        
        const page = pdfDoc.getPage(i);
        const { width, height } = page.getSize();
        const scale = 2; // Increase scale for better resolution

        const embeddedPdf = await PDFDocument.create();
        const [copiedPage] = await embeddedPdf.copyPages(pdfDoc, [i]);
        embeddedPdf.addPage(copiedPage);
        const pdfBytes = await embeddedPdf.save();

        // Use a canvas to render the page
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const context = canvas.getContext('2d');
        
        if (!context) {
            throw new Error('Could not get canvas context');
        }

        // Dynamically import and use pdf.js for rendering
        const pdfjsLib = await import('pdfjs-dist/build/pdf');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
        const pdf = await loadingTask.promise;
        const pdfPage = await pdf.getPage(1);
        
        const viewport = pdfPage.getViewport({ scale });
        const renderContext = {
            canvasContext: context,
            viewport: viewport,
        };

        await pdfPage.render(renderContext).promise;
        
        base64Images.push(canvas.toDataURL('image/jpeg', 0.9));
      }

      setProcessingState('processing_ai');
      setProcessingMessage('AI is analyzing your receipt. This may take a moment...');

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

      // Update receipt status to 'processed'
      const { error: updateError } = await supabase
        .from('receipts')
        .update({ status: 'processed' })
        .eq('id', newReceipt.id);

      if (updateError) {
        console.error('Failed to update receipt status:', updateError.message);
        // Non-critical error, proceed with adding to UI
      }

      onReceiptAdded(newReceipt, expenses);
      setFile(null);

    } catch (e: any) {
      console.error('Error processing PDF:', e);
      setError(`An error occurred: ${e.message}. Please try again.`);
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
      setProcessingMessage('');
    }
  };

  const isLoading = processingState !== 'idle' && processingState !== 'error';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Receipt</CardTitle>
        <CardDescription>Upload a PDF receipt to automatically extract expenses.</CardDescription>
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
                <p>Drop the PDF here ...</p>
              ) : (
                <p>Drag 'n' drop a PDF here, or click to select file</p>
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
                <span>{processingMessage}</span>
              </div>
            ) : (
              <Button onClick={processPdf} className="w-full" disabled={isLoading}>
                Process Receipt
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { Loader2, Upload, FileText, XCircle, CheckCircle } from 'lucide-react';

interface ReceiptUploadProps {
  onUploadSuccess: () => void;
}

type ProcessingStatus = 'idle' | 'uploading' | 'pending' | 'processing' | 'completed' | 'failed';

const ReceiptUpload: React.FC<ReceiptUploadProps> = ({ onUploadSuccess }) => {
  const { supabase, session } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Realtime subscription effect (the original logic)
  useEffect(() => {
    if (!supabase || !receiptId) return;

    const channel = supabase
      .channel(`receipt_${receiptId}`)
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'receipts',
          filter: `id=eq.${receiptId}`
        },
        (payload) => {
          const newStatus = (payload.new as { processing_status: string, error_message: string | null }).processing_status as ProcessingStatus;
          const newError = (payload.new as { processing_status: string, error_message: string | null }).error_message;

          setProcessingStatus(newStatus);
          setErrorMessage(newError);

          if (newStatus === 'processing') {
            setProgress(50);
          } else if (newStatus === 'completed') {
            setProgress(100);
            showSuccess('Receipt processed successfully! Expense added.');
            onUploadSuccess(); // Trigger list refresh
            setTimeout(() => handleReset(), 5000);
          } else if (newStatus === 'failed') {
            setProgress(100);
            showError(`Processing failed: ${newError || 'Unknown error'}`);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to receipt ${receiptId} status.`);
        }
      });

    return () => {
      // This cleanup function is what causes the progress bar to close on navigation
      supabase.removeChannel(channel);
    };
  }, [supabase, receiptId, onUploadSuccess]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
      handleReset(); // Reset status if a new file is selected
    }
  };

  const handleReset = () => {
    setFile(null);
    setProcessingStatus('idle');
    setProgress(0);
    setReceiptId(null);
    setErrorMessage(null);
  };

  const handleUpload = useCallback(async () => {
    if (!file || !session) {
      showError('Please select a file to upload.');
      return;
    }

    setProcessingStatus('uploading');
    setProgress(10);
    const toastId = showLoading(`Uploading ${file.name}...`);

    try {
      const fileExtension = file.name.split('.').pop();
      const storagePath = `${session.user.id}/${Date.now()}.${fileExtension}`;

      // 1. Upload the file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      // 2. Create a new receipt record with 'pending' status
      const { data: receiptData, error: receiptError } = await supabase
        .from('receipts')
        .insert({
          user_id: session.user.id,
          storage_path: storagePath,
          filename: file.name,
          processing_status: 'pending', // Initial status
        })
        .select('id')
        .single();

      if (receiptError || !receiptData) {
        // Clean up storage if database insert fails
        await supabase.storage.from('receipts').remove([storagePath]);
        throw new Error(`Database insert failed: ${receiptError?.message || 'No data returned'}`);
      }

      dismissToast(toastId);
      showSuccess(`Receipt "${file.name}" uploaded successfully! Processing started...`);
      
      // 3. Start tracking the job
      setReceiptId(receiptData.id);
      setProcessingStatus('pending');
      setProgress(25);

    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message);
      setProcessingStatus('failed');
      setErrorMessage(error.message);
      setProgress(100);
      console.error('Upload error:', error);
    }
  }, [file, session, supabase]);

  const isProcessing = processingStatus !== 'idle' && processingStatus !== 'completed' && processingStatus !== 'failed';
  const isFinished = processingStatus === 'completed' || processingStatus === 'failed';

  const getStatusIcon = () => {
    switch (processingStatus) {
      case 'uploading':
      case 'pending':
      case 'processing':
        return <Loader2 className="h-5 w-5 mr-2 animate-spin text-primary" />;
      case 'completed':
        return <CheckCircle className="h-5 w-5 mr-2 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 mr-2 text-destructive" />;
      default:
        return <FileText className="h-5 w-5 mr-2 text-gray-500" />;
    }
  };

  const getStatusText = () => {
    switch (processingStatus) {
      case 'uploading':
        return 'Uploading file...';
      case 'pending':
        return 'Queued for processing...';
      case 'processing':
        return 'AI is extracting data...';
      case 'completed':
        return 'Processing complete!';
      case 'failed':
        return `Failed: ${errorMessage || 'Unknown error'}`;
      default:
        return file ? `Ready to upload: ${file.name}` : 'Select a file to begin.';
    }
  };

  return (
    <Card className="w-full max-w-5xl mx-auto shadow-lg shadow-black/5 border-0">
      <CardHeader>
        <CardTitle className="text-2xl">Upload Receipt</CardTitle>
        <CardDescription>Upload an image of your receipt (JPG, PNG, PDF) to automatically extract expense details.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid w-full items-center gap-4">
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="receipt-file">Receipt File</Label>
            <Input 
              id="receipt-file" 
              type="file" 
              accept=".jpg,.jpeg,.png,.pdf" 
              onChange={handleFileChange} 
              disabled={isProcessing}
            />
          </div>
          <Button 
            onClick={handleUpload} 
            disabled={!file || isProcessing}
            className="w-full"
          >
            {processingStatus === 'uploading' ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</>
            ) : (
              <><Upload className="mr-2 h-4 w-4" /> Start Processing</>
            )}
          </Button>
        </div>

        {(isProcessing || isFinished) && (
          <div className="mt-6 p-4 border rounded-lg bg-secondary/50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                {getStatusIcon()}
                <span className={`font-medium ${processingStatus === 'failed' ? 'text-destructive' : ''}`}>
                  {getStatusText()}
                </span>
              </div>
              {isFinished && (
                <Button variant="ghost" size="icon" onClick={handleReset} title="Clear status">
                  <XCircle className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                </Button>
              )}
            </div>
            <Progress value={progress} className="w-full" />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ReceiptUpload;
'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { Loader2, Upload, FileText, XCircle, CheckCircle, Clock } from 'lucide-react';
import { useReceiptProcessing } from './ReceiptProcessingContext'; // Import the new hook

interface ReceiptUploadProps {
  onUploadSuccess: () => void;
}

const ReceiptUpload: React.FC<ReceiptUploadProps> = ({ onUploadSuccess }) => {
  const { supabase, session } = useSession();
  const { pendingJobs, addJob, clearJob } = useReceiptProcessing(); // Use the context
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
    }
  };

  const handleUpload = useCallback(async () => {
    if (!file || !session) {
      showError('Please select a file to upload.');
      return;
    }

    setIsUploading(true);
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
        .select('id, filename')
        .single();

      if (receiptError || !receiptData) {
        // Clean up storage if database insert fails
        await supabase.storage.from('receipts').remove([storagePath]);
        throw new Error(`Database insert failed: ${receiptError?.message || 'No data returned'}`);
      }

      // 3. Add the job to the global context for persistent tracking
      addJob({ receipt_id: receiptData.id, filename: receiptData.filename });

      // 4. Trigger the background worker (assuming a Supabase Edge Function or similar is listening to 'receipts' table inserts)
      // NOTE: The actual worker trigger is handled by a database trigger or a dedicated service.
      // The client's job is done here.

      dismissToast(toastId);
      showSuccess(`Receipt "${file.name}" uploaded successfully! Processing started in the background.`);
      
      setFile(null);
      onUploadSuccess(); // Notify parent (e.g., to refresh the expenses list later)

    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message);
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
    }
  }, [file, session, supabase, onUploadSuccess, addJob]);

  const pendingJobsCount = pendingJobs.length;
  const processingJob = useMemo(() => pendingJobs.find(j => j.status === 'processing'), [pendingJobs]);

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
              disabled={isUploading}
            />
          </div>
          <Button 
            onClick={handleUpload} 
            disabled={!file || isUploading}
            className="w-full"
          >
            {isUploading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</>
            ) : (
              <><Upload className="mr-2 h-4 w-4" /> Start Processing</>
            )}
          </Button>
        </div>

        {/* Global Status Indicator */}
        {pendingJobsCount > 0 && (
          <div className="mt-6 p-4 border rounded-lg bg-yellow-100/50 dark:bg-yellow-900/30 border-yellow-500/50">
            <h4 className="font-semibold text-sm flex items-center text-yellow-700 dark:text-yellow-300">
              <Clock className="h-4 w-4 mr-2" /> 
              {pendingJobsCount} Receipt{pendingJobsCount > 1 ? 's' : ''} in Background Queue
            </h4>
            {pendingJobs.map(job => (
              <div key={job.receipt_id} className="mt-2 text-sm flex items-center justify-between p-2 bg-background rounded-md shadow-sm">
                <div className="flex items-center truncate">
                  {job.status === 'pending' && <Clock className="h-4 w-4 mr-2 text-gray-500" />}
                  {job.status === 'processing' && <Loader2 className="h-4 w-4 mr-2 animate-spin text-primary" />}
                  {job.status === 'completed' && <CheckCircle className="h-4 w-4 mr-2 text-green-500" />}
                  {job.status === 'failed' && <XCircle className="h-4 w-4 mr-2 text-destructive" />}
                  <span className="truncate font-medium">{job.filename}</span>
                </div>
                <div className="flex items-center space-x-2 min-w-[100px] justify-end">
                  <span className={`font-mono text-xs ${
                    job.status === 'completed' ? 'text-green-600' : 
                    job.status === 'failed' ? 'text-destructive' : 
                    'text-primary'
                  }`}>
                    {job.status.toUpperCase()}
                  </span>
                  {(job.status === 'completed' || job.status === 'failed') && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => clearJob(job.receipt_id)}
                      title="Dismiss notification"
                    >
                      <XCircle className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ReceiptUpload;
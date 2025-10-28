'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Loader2, Upload, FileCheck2, X, AlertTriangle } from 'lucide-react';
import { useSession } from '@/components/SessionContextProvider';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useReceiptReviewStore } from '@/store/receiptReviewStore';
import { useNavigate } from 'react-router-dom';

interface ReceiptUploadProps {
  onUploadComplete: () => void;
}

interface UploadedFile extends File {
  preview: string;
}

interface UploadStatus {
  file: UploadedFile;
  progress: number;
  status: 'uploading' | 'processing' | 'success' | 'error';
  error?: string;
}

const ReceiptUpload: React.FC<ReceiptUploadProps> = ({ onUploadComplete }) => {
  const { supabase, session } = useSession();
  const navigate = useNavigate();
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null);
  const setReviewData = useReceiptReviewStore((state) => state.setReviewData);

  const handleProcessReceipt = useCallback(async (receiptId: string, base64Image: string, file: UploadedFile) => {
    if (!session) {
      showError('You must be logged in to process receipts.');
      return;
    }

    setUploadStatus(prev => prev ? { ...prev, status: 'processing' } : null);

    try {
      const response = await fetch('/api/process-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ base64Image, receiptId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process receipt.');
      }

      const { expenses } = await response.json();

      if (!expenses || expenses.length === 0) {
        throw new Error('No expenses were extracted from the receipt.');
      }
      
      const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(`${session.user.id}/${receiptId}.jpg`);

      setReviewData({
        receiptId,
        imageUrl: publicUrl,
        expenses,
      });

      setUploadStatus(prev => prev ? { ...prev, status: 'success' } : null);
      showSuccess('Receipt processed! Please review the details.');

      navigate(`/review-receipt/${receiptId}`);

    } catch (error: any) {
      console.error('Error processing receipt:', error);
      setUploadStatus(prev => prev ? { ...prev, status: 'error', error: error.message } : null);
      showError(`Processing failed: ${error.message}`);
    }
  }, [session, supabase, setReviewData, navigate]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file || !supabase || !session) return;

    const uploadedFile: UploadedFile = Object.assign(file, {
      preview: URL.createObjectURL(file),
    });

    setUploadStatus({ file: uploadedFile, progress: 0, status: 'uploading' });

    const receiptId = crypto.randomUUID();
    const filePath = `${session.user.id}/${receiptId}.jpg`;

    const toastId = showLoading('Uploading receipt...');

    try {
      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;
      dismissToast(toastId);
      
      const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(filePath);
      const { error: dbError } = await supabase
        .from('receipts')
        .insert({
          id: receiptId,
          user_id: session.user.id,
          storage_path: filePath,
          public_url: publicUrl,
          filename: file.name,
          status: 'uploaded',
        });

      if (dbError) throw dbError;

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = () => {
        const base64data = reader.result as string;
        handleProcessReceipt(receiptId, base64data, uploadedFile);
      };
      reader.onerror = (error) => {
        throw new Error("Failed to read file for processing.");
      };

    } catch (error: any) {
      dismissToast(toastId);
      console.error('Upload error:', error);
      setUploadStatus(prev => prev ? { ...prev, status: 'error', error: error.message } : null);
      showError(`Upload failed: ${error.message}`);
    }
  }, [supabase, session, handleProcessReceipt]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.png', '.jpg'] },
    multiple: false,
  });

  const clearUpload = () => {
    if (uploadStatus?.file.preview) {
      URL.revokeObjectURL(uploadStatus.file.preview);
    }
    setUploadStatus(null);
  };

  return (
    <div className="w-full">
      {!uploadStatus ? (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-4 text-foreground/60">
            <Upload className="w-12 h-12" />
            <p className="font-semibold">Drag & drop a receipt image here, or click to select</p>
            <p className="text-sm">PNG, JPG, JPEG up to 10MB</p>
          </div>
        </div>
      ) : (
        <div className="border rounded-lg p-4 flex items-center gap-4 relative">
          <img src={uploadStatus.file.preview} alt="Receipt preview" className="w-20 h-20 rounded-md object-cover" />
          <div className="flex-grow">
            <p className="font-semibold truncate">{uploadStatus.file.name}</p>
            <div className="flex items-center gap-2 mt-1">
              {uploadStatus.status === 'uploading' && <Loader2 className="w-4 h-4 animate-spin" />}
              {uploadStatus.status === 'processing' && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
              {uploadStatus.status === 'success' && <FileCheck2 className="w-4 h-4 text-green-500" />}
              {uploadStatus.status === 'error' && <AlertTriangle className="w-4 h-4 text-destructive" />}
              <span className="text-sm capitalize text-foreground/80">{uploadStatus.status}</span>
            </div>
            {uploadStatus.status === 'uploading' && (
              <Progress value={uploadStatus.progress} className="w-full mt-2 h-2" />
            )}
            {uploadStatus.status === 'error' && (
              <p className="text-sm text-destructive mt-1">{uploadStatus.error}</p>
            )}
          </div>
          <Button variant="ghost" size="icon" className="absolute top-2 right-2" onClick={clearUpload}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default ReceiptUpload;
import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { Loader2, UploadCloud } from 'lucide-react';
import ExpenseSplitterDialog from './ExpenseSplitterDialog'; // Import the new dialog

interface ReceiptUploadProps {
  onReceiptProcessed: () => void;
  selectedBatchId: string | null; // New prop for the selected batch ID
}

const ReceiptUpload: React.FC<ReceiptUploadProps> = ({ onReceiptProcessed, selectedBatchId }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const { session, supabase } = useSession(); // Destructure supabase client

  const [isSplitterDialogOpen, setIsSplitterDialogOpen] = useState(false);
  const [extractedExpenses, setExtractedExpenses] = useState<any[] | null>(null);
  const [currentReceiptId, setCurrentReceiptId] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpeg', '.jpg'],
      'image/png': ['.png'],
      'application/pdf': ['.pdf'],
    },
    multiple: false,
  });

  const handleFileUpload = async () => {
    if (!file) {
      showError('Please select a file to upload.');
      return;
    }

    if (!session) {
      showError('You must be logged in to upload receipts.');
      return;
    }

    if (!selectedBatchId) {
      showError('Please select or create an expense batch before uploading receipts.');
      return;
      }

    setLoading(true);
    const toastId = showLoading('Processing receipt with AI...');

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64Image = reader.result as string;

        // Use supabase.functions.invoke for calling the Edge Function
        const { data, error } = await supabase.functions.invoke('process-receipt', {
          body: { base64Image, filename: file.name, batchId: selectedBatchId },
        });

        if (error) {
          console.error('Supabase Function Invoke Error:', error);
          throw new Error(error.message || 'Failed to process receipt with AI.');
        }

        dismissToast(toastId); // Dismiss loading toast
        showSuccess('Receipt processed by AI. Please review and save expenses.');
        setFile(null); // Clear the file input

        setExtractedExpenses(data.expenses);
        setCurrentReceiptId(data.receiptId);
        setIsSplitterDialogOpen(true); // Open the splitter dialog
      };
      reader.onerror = (error) => {
        throw new Error('Failed to read file: ' + error);
      };
    } catch (error: any) {
      dismissToast(toastId); // Dismiss loading toast even on error

      let errorMessage = 'An unexpected error occurred.';
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        errorMessage = 'Network error: Could not connect to the server. Please check your internet connection or try again later.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      showError(errorMessage);
      console.error('Receipt upload error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExpensesSaved = () => {
    setIsSplitterDialogOpen(false);
    setExtractedExpenses(null);
    setCurrentReceiptId(null);
    onReceiptProcessed(); // Notify parent component to refresh data
  };

  return (
    <>
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Upload Receipt</CardTitle>
          <CardDescription>Drag and drop your receipt image or PDF here, or click to select a file.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
          >
            <input {...getInputProps()} />
            {isDragActive ? (
              <p className="text-gray-600 dark:text-gray-400">Drop the files here ...</p>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-2">
                <UploadCloud className="h-12 w-12 text-gray-400 dark:text-gray-500" />
                <p className="text-gray-600 dark:text-gray-400">
                  Drag 'n' drop a receipt image or PDF here, or click to select one
                </p>
                {file && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Selected file: {file.name}</p>
                )}
              </div>
            )}
          </div>
          <Button
            onClick={handleFileUpload}
            className="w-full mt-6"
            disabled={!file || loading || !selectedBatchId}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              'Process Receipt'
            )}
          </Button>
          {!selectedBatchId && (
            <p className="text-sm text-red-500 mt-2 text-center">Please select or create an expense batch.</p>
          )}
        </CardContent>
      </Card>

      <ExpenseSplitterDialog
        open={isSplitterDialogOpen}
        onOpenChange={setIsSplitterDialogOpen}
        initialExpenses={extractedExpenses}
        receiptId={currentReceiptId}
        batchId={selectedBatchId}
        onExpensesSaved={handleExpensesSaved}
      />
    </>
  );
};

export default ReceiptUpload;
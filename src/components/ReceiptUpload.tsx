import React, { useState } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card'; // ADDED
import { Label } from '@/components/ui/label'; // ADDED
import { Loader2, UploadCloud } from 'lucide-react';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { v4 as uuidv4 } from 'uuid';
import { useNavigate } from 'react-router-dom';

interface ReceiptUploadProps {
  onUploadSuccess: () => void;
  batchId: string;
}

const ReceiptUpload: React.FC<ReceiptUploadProps> = ({ onUploadSuccess, batchId }) => {
  const { supabase, session } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !session || !supabase) {
      showError('Please select a file and ensure you are logged in.');
      return;
    }

    setLoading(true);
    const toastId = showLoading('Uploading receipt and starting AI processing...');

    try {
      const fileExtension = file.name.split('.').pop();
      if (!fileExtension) throw new Error('Could not determine file extension.');

      // 1. Define the storage path
      // Path format: [user_id]/[uuid].[ext]
      const storagePath = `${session.user.id}/${uuidv4()}.${fileExtension}`;
      
      // CRITICAL LOGGING: Confirm the path being used for upload
      console.log('Attempting to upload file to storage path:', storagePath);

      // 2. Upload the file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        console.error('Supabase Storage Upload Error:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // 3. Create a new receipt record in the database
      const { data: receiptData, error: receiptError } = await supabase
        .from('receipts')
        .insert({
          user_id: session.user.id,
          batch_id: batchId,
          storage_path: storagePath, // Save the exact path used for upload
          status: 'uploaded',
        })
        .select('id')
        .single();

      if (receiptError || !receiptData) {
        console.error('Supabase DB Insert Error:', receiptError);
        throw new Error(`Failed to create receipt record: ${receiptError?.message}`);
      }

      const receiptId = receiptData.id;

      // 4. Convert file to Base64 for Edge Function processing
      const base64Image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
            const base64 = reader.result.split(',')[1];
            resolve(base64);
          } else {
            reject(new Error('Failed to read file as base64 string.'));
          }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
      });

      // 5. Call the Edge Function for AI processing
      const { data: aiResponse, error: edgeFunctionError } = await supabase.functions.invoke('process-receipt', {
        body: JSON.stringify({
          base64Image: base64Image,
          filename: file.name,
          batchId: batchId,
          receiptId: receiptId, // Pass the newly created receipt ID
        }),
      });

      if (edgeFunctionError) {
        console.error('Edge Function Error:', edgeFunctionError);
        throw new Error(`AI processing failed: ${edgeFunctionError.message}`);
      }

      // 6. Handle AI response (extracted expenses)
      const extractedExpenses = aiResponse.expenses;
      if (!extractedExpenses || extractedExpenses.length === 0) {
        // If no expenses are extracted, navigate to the review screen for manual entry
        showSuccess('Upload successful, but AI extraction failed. Please review manually.');
        navigate(`/review/${receiptId}`);
        return;
      }

      // 7. Save extracted expenses to the store and navigate to the splitter
      const { setReviewData } = (await import('@/store/receiptReviewStore')).useReceiptReviewStore.getState();
      
      // Generate the public URL for the viewer before navigating
      const { data: urlData } = supabase.storage
        .from('receipts')
        .getPublicUrl(storagePath);

      if (!urlData?.publicUrl) {
        throw new Error('Could not generate public URL after upload.');
      }

      setReviewData({
        receiptId: receiptId,
        imageUrl: urlData.publicUrl,
        expenses: extractedExpenses,
      });

      showSuccess('AI extraction complete. Review and save expenses.');
      onUploadSuccess(); // This will open the ExpenseSplitterDialog
      
    } catch (error: any) {
      console.error('Full Upload Process Error:', error);
      showError(error.message || 'An unknown error occurred during upload.');
    } finally {
      dismissToast(toastId);
      setLoading(false);
      setFile(null);
    }
  };

  return (
    <Card className="w-full">
      <CardContent className="p-6">
        <form onSubmit={handleUpload} className="flex flex-col space-y-4">
          <div className="space-y-2">
            <Label htmlFor="receipt-file">Upload Receipt Image (JPG, PNG)</Label>
            <Input
              id="receipt-file"
              type="file"
              accept=".jpg,.jpeg,.png"
              onChange={handleFileChange}
              disabled={loading}
            />
          </div>
          <Button type="submit" disabled={loading || !file} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <UploadCloud className="mr-2 h-4 w-4" />
                Upload & Process
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default ReceiptUpload;
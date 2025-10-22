import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/components/SessionContextProvider';
import { showSuccess, showError } from '@/utils/toast';
import { Loader2 } from 'lucide-react';

const UploadReceipt = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const navigate = useNavigate();
  const { session } = useSession();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      showError('Please select a file to upload.');
      return;
    }

    if (!session) {
      showError('You must be logged in to upload receipts.');
      return;
    }

    setIsUploading(true);

    try {
      // 1. Upload the file to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${session.user.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await session.supabase.storage
        .from('receipts')
        .upload(fileName, file);

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      // 2. Insert a record into the 'receipts' table
      const { error: insertError } = await session.supabase
        .from('receipts')
        .insert({
          user_id: session.user.id,
          storage_path: fileName,
          status: 'uploaded',
        });

      if (insertError) {
        throw new Error(insertError.message);
      }

      showSuccess('Receipt uploaded successfully! It will be processed shortly.');
      navigate('/'); // Navigate back to the main expense list
    } catch (error) {
      console.error('Upload failed:', error);
      showError(`Upload failed: ${error instanceof Error ? error.message : 'An unknown error occurred'}`);
    } finally {
      setIsUploading(false);
      setFile(null);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Upload Receipt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="receipt-file" className="block text-sm font-medium text-gray-700">
              Select Receipt Image or PDF
            </label>
            <Input
              id="receipt-file"
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileChange}
              disabled={isUploading}
            />
            {file && (
              <p className="text-sm text-muted-foreground">Selected file: {file.name}</p>
            )}
          </div>

          <Button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="w-full"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              'Upload Receipt'
            )}
          </Button>

          <div className="text-center text-sm text-muted-foreground pt-4">
            <p>
              Upload a receipt image or PDF. Our system will automatically extract the expense details.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default UploadReceipt;
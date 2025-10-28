import React, { useState, useEffect } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { Loader2, ImageOff } from 'lucide-react';

interface ReceiptViewerProps {
  receiptId: string | null;
}

const ReceiptViewer: React.FC<ReceiptViewerProps> = ({ receiptId }) => {
  const { supabase, session } = useSession();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReceiptAndUrl = async () => {
      if (!receiptId || !session) {
        setLoading(false);
        return;
      }

      setLoading(true);
      
      // 1. Fetch the storage path from the receipts table
      const { data: receipt, error: fetchError } = await supabase
        .from('receipts')
        .select('storage_path')
        .eq('id', receiptId)
        .single();

      if (fetchError || !receipt?.storage_path) {
        console.error('Failed to fetch receipt storage path:', fetchError?.message);
        setImageUrl(null);
        setLoading(false);
        return;
      }

      // 2. Get the public URL from Supabase Storage
      // Note: The 'receipts' bucket must be public for this to work without signed URLs.
      // Assuming 'receipts' bucket is public or RLS is handled for storage access.
      const { data: urlData } = supabase.storage
        .from('receipts')
        .getPublicUrl(receipt.storage_path);
      
      if (urlData?.publicUrl) {
        setImageUrl(urlData.publicUrl);
      } else {
        setImageUrl(null);
      }
      setLoading(false);
    };

    fetchReceiptAndUrl();
  }, [receiptId, session, supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] bg-muted/50 rounded-lg">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-muted/50 rounded-lg p-4 text-muted-foreground">
        <ImageOff className="h-10 w-10 mb-2" />
        <p>Receipt image not available.</p>
        <p className="text-xs text-center mt-1">Ensure the receipt was uploaded correctly and the storage bucket is configured.</p>
      </div>
    );
  }

  // Display the image
  return (
    <div className="min-h-[400px] bg-muted/50 rounded-lg overflow-hidden flex justify-center">
      <img 
        src={imageUrl} 
        alt="Receipt" 
        className="w-full h-auto object-contain max-h-[90vh]" 
        style={{ maxHeight: 'calc(90vh - 40px)' }}
      />
    </div>
  );
};

export default ReceiptViewer;
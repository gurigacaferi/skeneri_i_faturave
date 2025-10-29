import React, { useState, useEffect } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { Loader2, ImageOff, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Button } from '@/components/ui/button';

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
      setImageUrl(null); // Reset on new receiptId
      
      const { data: receipt, error: fetchError } = await supabase
        .from('receipts')
        .select('storage_path')
        .eq('id', receiptId)
        .single();

      if (fetchError || !receipt?.storage_path) {
        console.error('Failed to fetch receipt storage path:', fetchError?.message);
        setLoading(false);
        return;
      }

      const storagePath = receipt.storage_path;
      let finalUrl: string | null = null;

      // 1. Try to get the public URL
      const { data: publicUrlData } = supabase.storage
        .from('receipts')
        .getPublicUrl(storagePath);
      
      if (publicUrlData?.publicUrl) {
        // 2. Check if the public URL is accessible (prevents 404 if bucket is private)
        try {
          // Use HEAD request to check accessibility without downloading the full image
          const testResponse = await fetch(publicUrlData.publicUrl, { method: 'HEAD' });
          if (testResponse.ok) {
            finalUrl = publicUrlData.publicUrl;
          }
        } catch (e) {
          // Ignore network errors during HEAD request, proceed to signed URL fallback
          console.warn('Public URL check failed, falling back to signed URL.');
        }
      }

      // 3. If public URL failed, generate a signed URL
      if (!finalUrl) {
        const { data: signedUrlData, error: signedError } = await supabase.storage
          .from('receipts')
          .createSignedUrl(storagePath, 3600); // 1 hour expiration

        if (signedError) {
          console.error('Failed to generate signed URL:', signedError.message);
        }
        finalUrl = signedUrlData?.signedUrl ?? null;
      }

      if (finalUrl) {
        setImageUrl(finalUrl);
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

  return (
    // Removed h-full and overflow-hidden. Added min-h-[400px] for visual consistency when image is short.
    <div className="min-h-[400px] bg-muted/50 rounded-lg flex flex-col relative">
      <TransformWrapper>
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <div className="absolute top-2 left-2 z-10 flex gap-2">
              <Button variant="outline" size="icon" onClick={() => zoomIn()} className="h-8 w-8 bg-background/80 hover:bg-background">
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => zoomOut()} className="h-8 w-8 bg-background/80 hover:bg-background">
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => resetTransform()} className="h-8 w-8 bg-background/80 hover:bg-background">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
            <TransformComponent
              wrapperStyle={{ width: '100%', height: 'auto' }}
              contentStyle={{ width: '100%', height: 'auto' }}
            >
              <img 
                src={imageUrl} 
                alt="Receipt" 
                className="w-full h-auto object-contain"
              />
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
};

export default ReceiptViewer;
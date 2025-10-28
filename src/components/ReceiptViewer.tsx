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

      const { data: urlData } = supabase.storage
        .from('receipts')
        .getPublicUrl(receipt.storage_path);
      
      if (urlData?.publicUrl) {
        setImageUrl(urlData.publicUrl);
      }
      setLoading(false);
    };

    fetchReceiptAndUrl();
  }, [receiptId, session, supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px] bg-muted/50 rounded-lg">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] bg-muted/50 rounded-lg p-4 text-muted-foreground">
        <ImageOff className="h-10 w-10 mb-2" />
        <p>Receipt image not available.</p>
        <p className="text-xs text-center mt-1">Ensure the receipt was uploaded correctly and the storage bucket is configured.</p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-[400px] bg-muted/50 rounded-lg overflow-hidden flex flex-col relative">
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
              wrapperStyle={{ width: '100%', height: '100%' }}
              contentStyle={{ width: '100%', height: '100%' }}
            >
              <img 
                src={imageUrl} 
                alt="Receipt" 
                className="w-full h-full object-contain"
              />
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
};

export default ReceiptViewer;
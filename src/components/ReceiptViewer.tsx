import React, { useState, useEffect } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { Loader2, ImageOff, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ReceiptViewerProps {
  receiptId: string | null;
}

const ReceiptViewer: React.FC<ReceiptViewerProps> = ({ receiptId }) => {
  const { supabase, session } = useSession();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReceiptAndUrl = async () => {
      if (!receiptId || !session) {
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      setImageUrl(null);
      
      try {
        // 1. Fetch the storage path from the 'receipts' table
        const { data: receipt, error: fetchError } = await supabase
          .from('receipts')
          .select('storage_path')
          .eq('id', receiptId)
          .single();

        if (fetchError || !receipt?.storage_path) {
          const msg = fetchError?.message || 'Storage path not found in database.';
          console.error('Failed to fetch receipt storage path:', msg);
          setError(msg);
          return;
        }

        // 2. Get the public URL using the storage path
        const { data: urlData } = supabase.storage
          .from('receipts')
          .getPublicUrl(receipt.storage_path);
        
        if (urlData?.publicUrl) {
          setImageUrl(urlData.publicUrl);
          // CRITICAL DEBUGGING STEP: Log the URL so the user can check it manually
          console.log('Generated Receipt Image URL:', urlData.publicUrl);
        } else {
          setError('Could not generate public URL.');
        }
      } catch (e: any) {
        console.error('Error in ReceiptViewer:', e.message);
        setError(`An unexpected error occurred: ${e.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchReceiptAndUrl();
  }, [receiptId, session, supabase]);

  if (!receiptId) {
    return (
      <Card className="h-full flex items-center justify-center bg-muted/50 rounded-lg">
        <CardContent className="text-center p-6">
          <ImageOff className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No receipt selected or available for review.</p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px] bg-muted/50 rounded-lg">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !imageUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg p-4 text-red-600 dark:text-red-400">
        <ImageOff className="h-10 w-10 mb-2" />
        <p className="font-medium">Error loading receipt image.</p>
        <p className="text-xs text-center mt-1">Details: {error || 'URL not found'}</p>
        <p className="text-xs text-center mt-1">Check Supabase Storage RLS/permissions.</p>
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
                onError={(e) => {
                  console.error('Image load failed:', e);
                  setError('Image failed to load (404/CORS/Network error).');
                }}
              />
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
};

export default ReceiptViewer;
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { Loader2, ImageOff, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Button } from '@/components/ui/button';
import * as pdfjs from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url';

// Set the worker source for pdfjs-dist
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface ReceiptViewerProps {
  receiptId: string | null;
}

const ReceiptViewer: React.FC<ReceiptViewerProps> = ({ receiptId }) => {
  const { supabase, session } = useSession();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const renderPdfToImage = useCallback(async (pdfUrl: string) => {
    try {
      const pdf = await pdfjs.getDocument(pdfUrl).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2.0 });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not get canvas context');

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport }).promise;
      return canvas.toDataURL('image/jpeg');
    } catch (error) {
      console.error('Error rendering PDF to image:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    const fetchReceiptAndUrl = async () => {
      if (!receiptId || !session) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setImageUrl(null);
      
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
      
      // Always generate a signed URL to handle both public and private buckets securely
      const { data: signedUrlData, error: signedError } = await supabase.storage
        .from('receipts')
        .createSignedUrl(storagePath, 3600); // 1 hour expiration

      if (signedError || !signedUrlData?.signedUrl) {
        console.error('Failed to generate signed URL:', signedError?.message);
        setLoading(false);
        return;
      }

      const finalUrl = signedUrlData.signedUrl;

      // Check if the file is a PDF and render it to an image
      if (storagePath.toLowerCase().endsWith('.pdf')) {
        const pdfAsImageUrl = await renderPdfToImage(finalUrl);
        setImageUrl(pdfAsImageUrl);
      } else {
        // It's a regular image, use the URL directly
        setImageUrl(finalUrl);
      }
      
      setLoading(false);
    };

    fetchReceiptAndUrl();
  }, [receiptId, session, supabase, renderPdfToImage]);

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
    <div className="w-full bg-muted/50 rounded-lg flex flex-col relative">
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
              wrapperStyle={{
                width: '100%',
                height: 'auto',
              }}
              contentStyle={{
                width: '100%',
                height: 'auto',
              }}
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
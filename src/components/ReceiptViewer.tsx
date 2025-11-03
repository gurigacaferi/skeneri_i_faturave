"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { Loader2, ImageOff, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Button } from '@/components/ui/button';
import * as pdfjs from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface ReceiptViewerProps {
  receiptId: string | null;
  pageToDisplay?: number;
  totalPages?: number;
}

const ReceiptViewer: React.FC<ReceiptViewerProps> = ({ receiptId, pageToDisplay = 1 }) => {
  const { supabase, session } = useSession();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPdf, setIsPdf] = useState(false);
  const [pdfDocument, setPdfDocument] = useState<pdfjs.PDFDocumentProxy | null>(null);

  const renderPageToImage = useCallback(async (pdf: pdfjs.PDFDocumentProxy, pageNum: number) => {
    try {
      const page = await pdf.getPage(pageNum);
      // Use a fixed scale for rendering to ensure high quality, but let CSS handle display size
      const viewport = page.getViewport({ scale: 2.0 });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not get canvas context');

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport }).promise;
      return canvas.toDataURL('image/jpeg');
    } catch (error) {
      console.error(`Error rendering PDF page ${pageNum}:`, error);
      return null;
    }
  }, []);

  const fetchReceiptAndUrl = useCallback(async () => {
    if (!receiptId || !session) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setImageUrl(null);
    setPdfDocument(null);
    
    const { data: receipt, error: fetchError } = await supabase
      .from('receipts')
      .select('storage_path, filename')
      .eq('id', receiptId)
      .single();

    if (fetchError || !receipt?.storage_path) {
      console.error('Failed to fetch receipt storage path:', fetchError?.message);
      setLoading(false);
      return;
    }

    const storagePath = receipt.storage_path;
    const filename = receipt.filename || '';
    
    const { data: signedUrlData, error: signedError } = await supabase.storage
      .from('receipts')
      .createSignedUrl(storagePath, 3600);

    if (signedError || !signedUrlData?.signedUrl) {
      console.error('Failed to generate signed URL:', signedError?.message);
      setLoading(false);
      return;
    }

    const finalUrl = signedUrlData.signedUrl;
    const isPdfFile = filename.toLowerCase().endsWith('.pdf');
    setIsPdf(isPdfFile);

    if (isPdfFile) {
      try {
        const pdf = await pdfjs.getDocument(finalUrl).promise;
        setPdfDocument(pdf);
      } catch (error) {
        console.error('Error loading PDF document:', error);
        setImageUrl(null);
        setLoading(false);
      }
    } else {
      setImageUrl(finalUrl);
      setLoading(false);
    }
  }, [receiptId, session, supabase]);

  useEffect(() => {
    fetchReceiptAndUrl();
  }, [fetchReceiptAndUrl]);

  useEffect(() => {
    if (isPdf && pdfDocument && pageToDisplay >= 1 && pageToDisplay <= pdfDocument.numPages) {
      setLoading(true);
      renderPageToImage(pdfDocument, pageToDisplay).then(url => {
        setImageUrl(url);
        setLoading(false);
      });
    }
  }, [pageToDisplay, pdfDocument, isPdf, renderPageToImage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px] bg-muted/50 rounded-lg">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] bg-muted/50 rounded-lg p-4 text-muted-foreground">
        <ImageOff className="h-10 w-10 mb-2" />
        <p>Receipt image not available.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-muted/50 rounded-lg flex flex-col relative">
      <TransformWrapper
        initialScale={1}
        minScale={0.5}
        maxScale={4}
        centerOnInit={true}
      >
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
              wrapperStyle={{ width: '100%', height: '100%', overflow: 'hidden' }}
              contentStyle={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
            >
              <img src={imageUrl} alt="Receipt" className="max-w-full max-h-full object-contain" style={{ display: 'block' }} />
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
};

export default ReceiptViewer;
import * as pdfjs from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url';

// Set the worker source for pdfjs-dist
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Reads a File object and converts it into an array of base64 image strings.
 * Handles both image files and multi-page PDF files efficiently.
 * @param file The File object to process.
 * @returns A promise that resolves to an array of base64 image strings.
 */
export const fileToBase64Images = (file: File): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error('Failed to read file.'));
    };

    // Handle PDF files by reading as an ArrayBuffer for processing
    if (file.type === 'application/pdf') {
      reader.onload = async (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        try {
          const pdf = await pdfjs.getDocument(arrayBuffer).promise;
          const base64Images: string[] = [];

          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            // OPTIMIZATION: Reduced scale from 2.0 to 1.5 to lower image resolution
            const viewport = page.getViewport({ scale: 1.5 });
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) {
              return reject(new Error('Could not get canvas context for PDF rendering.'));
            }

            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport }).promise;
            // OPTIMIZATION: Reduced JPEG quality from 0.9 to 0.8 to decrease file size
            base64Images.push(canvas.toDataURL('image/jpeg', 0.8));
          }
          resolve(base64Images);
        } catch (error) {
          console.error('Error rendering PDF to image:', error);
          reject(new Error('Failed to render PDF pages.'));
        }
      };
      reader.readAsArrayBuffer(file);
    
    // Handle Image files much more efficiently by reading directly as a Data URL
    } else if (file.type.startsWith('image/')) {
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        resolve([dataUrl]);
      };
      reader.readAsDataURL(file);

    // Handle unsupported files
    } else {
      reject(new Error(`Unsupported file type: ${file.type}`));
    }
  });
};
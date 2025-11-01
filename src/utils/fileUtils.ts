import * as pdfjs from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url';

// Set the worker source for pdfjs-dist
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Reads a File object and converts it into an array of base64 image strings.
 * Handles both image files and multi-page PDF files.
 * @param file The File object to process.
 * @returns A promise that resolves to an array of base64 image strings.
 */
export const fileToBase64Images = (file: File): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;

      if (file.type === 'application/pdf') {
        try {
          const pdf = await pdfjs.getDocument(arrayBuffer).promise;
          const base64Images: string[] = [];

          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 });
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) {
              reject(new Error('Could not get canvas context for PDF rendering.'));
              return;
            }

            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport }).promise;
            base64Images.push(canvas.toDataURL('image/jpeg', 0.9));
          }
          resolve(base64Images);
        } catch (error) {
          console.error('Error rendering PDF to image:', error);
          reject(new Error('Failed to render PDF pages.'));
        }
      } else if (file.type.startsWith('image/')) {
        // For images, just convert the whole file to base64 data URL
        const base64String = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        resolve([`data:${file.type};base64,${base64String}`]);
      } else {
        reject(new Error(`Unsupported file type: ${file.type}`));
      }
    };

    reader.onerror = (error) => {
      reject(new Error('Failed to read file.'));
    };

    reader.readAsArrayBuffer(file);
  });
};
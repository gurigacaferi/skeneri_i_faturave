import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { Inngest, InngestFunction } from 'https://esm.sh/inngest@3.19.2/deno';
import { serve as serveInngest } from 'https://esm.sh/inngest@3.19.2/deno';
import * as pdfjs from 'https://esm.sh/pdfjs-dist@4.4.168';

const SYSTEM_PROMPT = `
You are an expert accountant AI. Your task is to meticulously extract structured expense data from a multi-page receipt document provided as a series of images.

**CRITICAL INSTRUCTIONS:**
1.  **PROCESS ALL PAGES:** You will receive multiple images, each representing a page of a single document. You MUST analyze every single image from start to finish.
2.  **EXTRACT EVERY SINGLE LINE ITEM:** Your primary goal is to identify and extract every individual line item or transaction. If you see a table of items, you MUST extract every single row as a separate expense. Do not summarize or stop after a few items. Your success is measured by completeness.
3.  **ACCURATE NUMBER PARSING:** You MUST correctly parse numbers. Pay close attention to decimal separators ('.' or ','). An amount like "12.20" or "12,20" must be extracted as the number \`12.2\`. An amount like "1,234.56" must be \`1234.56\`. Do not mistake decimal points for thousands separators.
4.  **ACCURATE PAGE NUMBERING:** For each extracted expense, you must correctly set the \`pageNumber\`. The images are provided in order: the first image is page 1, the second is page 2, and so on.

**MANDATORY CATEGORY LIST (ALBANIAN SUB-CATEGORIES):**
You MUST select one of the following detailed sub-categories for every single expense item. The 'category' field CANNOT be null or empty.
[
  "660-01 Paga bruto", "660-02 Sigurimi shendetesor", "660-03 Kontributi pensional",
  "665-01 Shpenzimet e qirase", "665-02 Material harxhues", "665-03 Pastrimi", "665-04 Ushqim dhe pije", "665-05 Shpenzime te IT-se", "665-06 Shpenzimt e perfaqesimit", "665-07 Asete nen 1000 euro", "665-09 Te tjera",
  "667-01 Sherbimet e kontabilitetit", "667-02 Sherbime ligjore", "667-03 Sherbime konsulente", "667-04 Sherbime auditimi",
  "668-01 Akomodimi", "668-02 Meditja", "668-03 Transporti",
  "669-01 Shpenzimet e karburantit", "669-02 Mirembajtje e riparim",
  "675-01 Interneti", "675-02 Telefon mobil", "675-03 Dergesa postare", "675-04 Telefon fiks",
  "683-01 Sigurimi i automjeteve", "683-02 Sigurimi i nderteses",
  "686-01 Energjia elektrike", "686-02 Ujesjellesi", "686-03 Pastrimi", "686-04 Shpenzimet e ngrohjes",
  "690-01 Shpenzimet e anetaresimit", "690-02 Shpenzimet e perkthimit", "690-03 Provizion bankar", "690-04 Mirembajtje e webfaqes", "690-05 Taksa komunale", "690-06 Mirembajtje e llogarise bankare", "690-09 Te tjera"
]

**DATA EXTRACTION FIELDS (in Albanian):**
You must extract the following fields for EACH line item:
- name: A short, descriptive name for the item (e.g., "Kafe", "Laptop Dell XPS", "Furnizim zyre").
- category: **MANDATORY.** Select one detailed sub-category from the list above. If the item does not fit any category, you MUST use "690-09 Te tjera". **ENSURE THIS FIELD IS PRESENT IN THE JSON OUTPUT.**
- amount: The price of the individual line item, as a number, correctly handling decimals.
- date: The date of the expense in YYYY-MM-DD format. This will likely be the same for all items on the receipt.
- merchant: The name of the merchant or store. This will likely be the same for all items.
- tvsh_percentage: The TVSH (VAT) percentage applied to the item, as a number (e.g., 20 for 20%). If not present, set to 0.
- vat_code: The VAT code of the merchant (NUIS / NIPT). This will likely be the same for all items.
- pageNumber: The page number (starting from 1) where this specific item was found.
- nui: The unique identifier of the invoice (NUI). This will likely be the same for all items.
- nr_fiskal: The fiscal number of the receipt. This will likely be the same for all items.
- numri_i_tvsh_se: The VAT number of the receipt. This will likely be the same for all items.
- description: A detailed description of the item, if available.
- sasia: The quantity of the item. If not specified, default to 1.
- njesia: The unit of the item (e.g., "cope", "kg"). If not specified, default to "cope".

**OUTPUT FORMAT:**
- Return a single JSON object with one key: "expenses".
- The value of "expenses" must be an array of JSON objects, where each object represents one extracted line item.
- If no valid expense data can be found across all images, return an empty "expenses" array.
`;

const inngest = new Inngest({
  id: 'fatural-app',
  signingKey: Deno.env.get('INNGEST_SIGNING_KEY'),
});

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// Helper to convert file from URL to base64 images
async function fileUrlToBase64Images(fileUrl: string, isPdf: boolean): Promise<string[]> {
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`);
  const fileBuffer = await response.arrayBuffer();

  if (isPdf) {
    const pdf = await pdfjs.getDocument(fileBuffer).promise;
    const base64Images: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      
      // Deno does not have a native canvas element. This part is tricky.
      // For now, we assume a polyfill or a different approach might be needed in a real Deno environment.
      // This code is illustrative of the logic but may fail in Deno without a canvas implementation.
      // A more robust solution would use a server-side rendering library for canvas.
      // Let's proceed with the logic, acknowledging this limitation.
      // A common workaround is to call another function (e.g., a different Deno Deploy function with CanvasKit)
      // or use a service for this conversion.
      // For this implementation, we'll assume a simplified path where we can get a data URL.
    }
    // This part is simplified due to Deno's lack of canvas.
    // In a real-world scenario, you'd use a library or service for PDF-to-image conversion.
    // We will return an empty array for PDF for now to avoid breaking the function.
    console.warn("PDF processing in Deno is complex without a canvas. Skipping PDF page conversion.");
    return [];
  } else {
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const base64 = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));
    return [`data:${contentType};base64,${base64}`];
  }
}

const processReceipt = inngest.createFunction(
  { id: 'process-receipt-job', name: 'Process Receipt Job' },
  { event: 'receipt/processing.requested' },
  async ({ event, step }) => {
    const { receiptId, storagePath, userId } = event.data;

    try {
      const base64Images = await step.run('convert-file-to-images', async () => {
        const { data: signedUrlData, error } = await supabaseAdmin.storage
          .from('receipts')
          .createSignedUrl(storagePath, 3600); // 1 hour expiry

        if (error) throw new Error(`Failed to create signed URL: ${error.message}`);
        
        const isPdf = storagePath.toLowerCase().endsWith('.pdf');
        return await fileUrlToBase64Images(signedUrlData.signedUrl, isPdf);
      });

      if (base64Images.length === 0) {
        throw new Error("File could not be converted to images for processing.");
      }

      const extractedData = await step.run('extract-expense-data-from-ai', async () => {
        const apiKey = Deno.env.get('OPENAI_API_KEY');
        if (!apiKey) throw new Error('OPENAI_API_KEY is not set.');

        const userMessageContent = [{ type: 'text', text: 'Extract expense data.' },
          ...base64Images.map(url => ({ type: 'image_url', image_url: { url, detail: 'high' } }))
        ];

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userMessageContent },
            ],
            response_format: { type: 'json_object' },
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`OpenAI API Error: ${errorData.error?.message}`);
        }
        const data = await response.json();
        return JSON.parse(data.choices[0].message.content);
      });

      await step.run('save-extracted-expenses', async () => {
        if (!extractedData.expenses || extractedData.expenses.length === 0) {
          return { message: "No expenses found to save." };
        }
        const expensesToInsert = extractedData.expenses.map((exp: any) => ({
          ...exp,
          receipt_id: receiptId,
          user_id: userId,
          batch_id: (await supabaseAdmin.from('receipts').select('batch_id').eq('id', receiptId).single()).data?.batch_id,
        }));

        const { error } = await supabaseAdmin.from('expenses').insert(expensesToInsert);
        if (error) throw new Error(`Failed to save expenses: ${error.message}`);
      });

      await step.run('update-receipt-status-to-completed', async () => {
        const { error } = await supabaseAdmin
          .from('receipts')
          .update({ status: 'completed' })
          .eq('id', receiptId);
        if (error) throw new Error(`Failed to update receipt status: ${error.message}`);
      });

      return { success: true, message: `Receipt ${receiptId} processed successfully.` };

    } catch (error) {
      await step.run('update-receipt-status-to-failed', async () => {
        await supabaseAdmin
          .from('receipts')
          .update({ status: 'failed', error_message: error.message })
          .eq('id', receiptId);
      });
      throw error;
    }
  }
);

serve({
  client: inngest,
  functions: [processReceipt],
});
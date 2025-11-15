import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { Inngest } from 'https://esm.sh/inngest@3.19.2/deno';
import { serve as serveInngest } from 'https://esm.sh/inngest@3.19.2/deno';
import * as pdfjs from 'https://esm.sh/pdfjs-dist@4.4.168';
import OpenAI from 'https://esm.sh/openai@4.52.0';

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
  "669-01 Shpenzimet e karburantit", "669-02 Mirembajtja e automjetit", "669-03 Sigurimi i automjetit",
  "670-01 Interesi bankar", "670-02 Komisione bankare",
  "671-01 Amortizimi i aseteve",
  "672-01 Tatim fitimi", "672-02 Tatime lokale", "672-03 TVSH",
  "673-01 Donacione",
  "674-01 Gjoba dhe penalitete",
  "675-01 Reklamimi dhe marketingu",
  "676-01 Shpenzime postare", "676-02 Shpenzime telefonike", "676-03 Shpenzime interneti",
  "677-01 Energjia elektrike", "677-02 Uji", "677-03 Ngrohja",
  "678-01 Sigurimi i pasurise", "678-02 Sigurimi i pergjegjesise civile",
  "679-01 Trajnime dhe kualifikime", "679-02 Literatura profesionale", "679-03 Kuotat e anetaresimit"
]

**JSON OUTPUT FORMAT:**
Your final output MUST be a single, valid JSON object. Do not include any text, explanations, or markdown formatting before or after the JSON. The structure must be:
{
  "expenses": [
    {
      "description": "string",
      "amount": number,
      "category": "string (must be one from the list)",
      "pageNumber": integer
    }
  ]
}
`;

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY'),
});

async function fileToImages(supabase: SupabaseClient, storagePath: string) {
  const { data, error } = await supabase.storage.from('receipts').download(storagePath);
  if (error) throw new Error(`Failed to download from Supabase storage: ${error.message}`);

  const buffer = await data.arrayBuffer();
  const uint8Array = new Uint8Array(buffer);

  if (data.type === 'application/pdf') {
    const pdf = await pdfjs.getDocument(uint8Array).promise;
    const images = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 3 });
      const canvas = new OffscreenCanvas(viewport.width, viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not get canvas context');

      await page.render({ canvasContext: context, viewport }).promise;
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      images.push(base64 as string);
    }
    return images;
  } else if (data.type.startsWith('image/')) {
     const base64 = btoa(String.fromCharCode.apply(null, Array.from(uint8Array)));
     return [base64];
  } else {
    throw new Error(`Unsupported file type: ${data.type}`);
  }
}

const processReceipt = new Inngest({ id: 'fatural-app' }).createFunction(
  { id: 'process-receipt-background-job', name: 'Process Receipt Background Job' },
  { event: 'receipt/processing.requested' },
  async ({ event }) => {
    const { receiptId, storagePath, userId } = event.data;

    try {
      const images = await fileToImages(supabaseAdmin, storagePath);

      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract all expense line items from the following document images:' },
            ...images.map((base64, i) => ({
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64}`,
                detail: 'high',
              },
            })),
          ],
        },
      ];

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: messages,
        response_format: { type: 'json_object' },
        max_tokens: 4096,
        temperature: 0,
        user: userId,
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('OpenAI returned an empty response.');
      }

      const { expenses } = JSON.parse(content);

      if (!Array.isArray(expenses)) {
        throw new Error('Invalid JSON structure from OpenAI. "expenses" is not an array.');
      }

      const expensesToInsert = expenses.map(expense => ({
        receipt_id: receiptId,
        user_id: userId,
        description: expense.description,
        amount: expense.amount,
        category: expense.category,
        page_number: expense.pageNumber,
      }));

      const { error: insertError } = await supabaseAdmin
        .from('expenses')
        .insert(expensesToInsert);

      if (insertError) {
        throw new Error(`Failed to insert expenses into database: ${insertError.message}`);
      }

      await supabaseAdmin
        .from('receipts')
        .update({ status: 'completed', processed_at: new Date().toISOString() })
        .eq('id', receiptId);

      return { success: true, message: `Processed ${expenses.length} expenses.` };

    } catch (error) {
      console.error('Error processing receipt:', error);
      await supabaseAdmin
        .from('receipts')
        .update({ status: 'failed', error_message: error.message })
        .eq('id', receiptId);
      
      return { success: false, message: error.message };
    }
  }
);

serve(serveInngest({
  client: new Inngest({ id: 'fatural-app' }),
  functions: [processReceipt],
}));
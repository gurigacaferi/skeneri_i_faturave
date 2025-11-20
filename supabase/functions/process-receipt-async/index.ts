import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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

// Helper to convert file to base64
async function fileToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  
  // Detect mime type
  let mimeType = 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) mimeType = 'image/png';
  else if (bytes[0] === 0x47 && bytes[1] === 0x49) mimeType = 'image/gif';
  else if (bytes[0] === 0x52 && bytes[1] === 0x49) mimeType = 'image/webp';
  else if (bytes[0] === 0x25 && bytes[1] === 0x50) mimeType = 'application/pdf';
  
  const base64 = btoa(String.fromCharCode(...bytes));
  return `data:${mimeType};base64,${base64}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let receiptId: string | undefined;
  
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { receiptId: rid, storagePath } = await req.json();
    receiptId = rid;

    if (!receiptId || !storagePath) {
      throw new Error('receiptId and storagePath are required');
    }

    console.log(`[${receiptId}] Processing receipt from ${storagePath}`);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('receipts')
      .download(storagePath);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    console.log(`[${receiptId}] File downloaded, size: ${fileData.size} bytes`);

    // Convert to base64
    const base64Image = await fileToBase64(fileData);
    const base64Images = [base64Image];

    // Call OpenAI
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not set');
    }

    const userMessageContent: any[] = [{
      type: 'text',
      text: 'Please extract the expense data from the following receipt image(s).',
    }];

    base64Images.forEach((base64) => {
      if (base64 && base64.startsWith('data:')) {
        userMessageContent.push({
          type: 'image_url',
          image_url: {
            url: base64,
            detail: 'high',
          },
        });
      }
    });

    console.log(`[${receiptId}] Calling OpenAI with ${base64Images.length} image(s)`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
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
      console.error(`[${receiptId}] OpenAI error:`, errorData);
      throw new Error(`OpenAI API Error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const content = JSON.parse(data.choices[0].message.content);

    // Validate categories
    const DEFAULT_FALLBACK_CATEGORY = "690-09 Te tjera";
    const VALID_CATEGORIES = [
      "660-01 Paga bruto", "660-02 Sigurimi shendetesor", "660-03 Kontributi pensional",
      "665-01 Shpenzimet e qirase", "665-02 Material harxhues", "665-03 Pastrimi", "665-04 Ushqim dhe pije", "665-05 Shpenzime te IT-se", "665-06 Shpenzimt e perfaqesimit", "665-07 Asete nen 1000 euro", "665-09 Te tjera",
      "667-01 Sherbimet e kontabilitetit", "667-02 Sherbime ligjore", "667-03 Sherbime konsulente", "667-04 Sherbime auditimi",
      "668-01 Akomodimi", "668-02 Meditja", "668-03 Transporti",
      "669-01 Shpenzimet e karburantit", "669-02 Mirembajtje e riparim",
      "675-01 Interneti", "675-02 Telefon mobil", "675-03 Dergesa postare", "675-04 Telefon fiks",
      "683-01 Sigurimi i automjeteve", "683-02 Sigurimi i nderteses",
      "686-01 Energjia elektrike", "686-02 Ujesjellesi", "686-03 Pastrimi", "686-04 Shpenzimet e ngrohjes",
      "690-01 Shpenzimet e anetaresimit", "690-02 Shpenzimet e perkthimit", "690-03 Provizion bankar", "690-04 Mirembajtje e webfaqes", "690-05 Taksa komunale", "690-06 Mirembajtje e llogarise bankare", "690-09 Te tjera"
    ];

    if (content.expenses && Array.isArray(content.expenses)) {
      content.expenses = content.expenses.map((expense: any) => {
        const category = expense.category || '';
        if (!category.trim() || !VALID_CATEGORIES.includes(category.trim())) {
          console.warn(`[${receiptId}] Invalid category for ${expense.name}, using fallback`);
          return { ...expense, category: DEFAULT_FALLBACK_CATEGORY };
        }
        return expense;
      });
    }

    console.log(`[${receiptId}] Extracted ${content.expenses?.length || 0} expenses`);

    // Update receipt status to processed
    const { error: updateError } = await supabase
      .from('receipts')
      .update({ 
        status: 'processed',
        processed_data: content 
      })
      .eq('id', receiptId);

    if (updateError) {
      console.error(`[${receiptId}] Error updating receipt:`, updateError);
    } else {
      console.log(`[${receiptId}] Successfully processed`);
    }

    return new Response(
      JSON.stringify({ success: true, expenses: content.expenses || [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error(`[${receiptId}] Processing error:`, error);
    
    // Update receipt to failed status
    if (receiptId) {
      try {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );
        await supabase
          .from('receipts')
          .update({ status: 'failed', error_message: error.message })
          .eq('id', receiptId);
      } catch (updateError) {
        console.error(`[${receiptId}] Failed to update error status:`, updateError);
      }
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

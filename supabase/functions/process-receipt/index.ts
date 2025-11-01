import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { corsHeaders } from '../_shared/cors.ts';

const SYSTEM_PROMPT = `
You are an expert accountant AI. Your task is to extract structured expense data from receipt images.
The user will provide one or more images of a receipt.
You must identify and extract the following fields in Albanian:
- name: A short, descriptive name for the expense (e.g., "Kafe", "Dreke Biznesi", "Furnizim zyre").
- category: The expense category. Choose from this list: [ "Ushqim & Pije", "Transport", "Akomodim", "Zyre & Shpenzime Operative", "Marketing & Reklamim", "Komunikim", "Trajnim & Zhvillim Profesional", "Taksat & Tarifat", "Mirembajtje & Riparime", "Te Tjera" ]. If you are unsure, use "Te Tjera".
- amount: The total amount of the expense, as a number. This is the final, total price paid.
- date: The date of the expense in YYYY-MM-DD format.
- merchant: The name of the merchant or store.
- tvsh_percentage: The TVSH (VAT) percentage applied, as a number (e.g., 20 for 20%). If not present, set to 0.
- vat_code: The VAT code of the merchant (NUIS / NIPT).
- pageNumber: The page number from the document where the expense was found.
- nui: The unique identifier of the invoice (NUI).
- nr_fiskal: The fiscal number of the receipt.
- numri_i_tvsh_se: The VAT number of the receipt.
- description: A detailed description of the expense.
- sasia: The quantity of the item.
- njesia: The unit of the item (e.g., "cope", "kg").

Rules:
1.  If the receipt contains multiple distinct items that should be categorized separately, return a JSON object for each item. For example, a single hotel bill might contain expenses for "Akomodim" and "Ushqim & Pije".
2.  If multiple images are provided, treat them as pages of the same document.
3.  All text fields must be in Albanian.
4.  The 'amount' must be the final total including all taxes.
5.  Return the data as a JSON object with a single key, "expenses", which is an array of the extracted expense objects.
6.  If no valid expense data can be found in the image, return an empty "expenses" array.
Example of a valid response:
{
  "expenses": [
    {
      "name": "Dreke Biznesi",
      "category": "Ushqim & Pije",
      "amount": 2550.00,
      "date": "2023-10-27",
      "merchant": "Restorant ABC",
      "tvsh_percentage": 20,
      "vat_code": "L12345678M",
      "pageNumber": 1,
      "nui": "AB123CD456",
      "nr_fiskal": "789/2023",
      "numri_i_tvsh_se": "VAT123456",
      "description": "Dreke me klientin per projektin e ri.",
      "sasia": 1,
      "njesia": "cope"
    }
  ]
}
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { base64Images, receiptId } = await req.json();

    if (!base64Images || !Array.isArray(base64Images) || base64Images.length === 0) {
      throw new Error('base64Images are required in the request body.');
    }
    if (!receiptId) {
      throw new Error('receiptId is required in the request body.');
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set in environment variables.');
    }

    const userMessageContent: { type: string; text?: string; image_url?: { url: string; detail: string; }; }[] = [{
      type: 'text',
      text: 'Please extract the expense data from the following receipt image(s).',
    }];

    base64Images.forEach((base64Image: string, index: number) => {
      if (base64Image && base64Image.startsWith('data:image')) {
        userMessageContent.push({
          type: 'image_url',
          image_url: {
            url: base64Image,
            detail: 'high',
          },
        });
      } else {
        console.warn(`Skipping invalid base64 image at index ${index} for receiptId ${receiptId}`);
      }
    });

    if (userMessageContent.length <= 1) {
      throw new Error('No valid images were provided to process.');
    }

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
      console.error('OpenAI API Error Response:', JSON.stringify(errorData, null, 2));
      const errorMessage = errorData.error?.message || 'An unknown error occurred with the OpenAI API.';
      throw new Error(`OpenAI API Error: ${errorMessage}`);
    }

    const data = await response.json();
    const content = JSON.parse(data.choices[0].message.content);

    return new Response(JSON.stringify(content), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error processing receipt:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
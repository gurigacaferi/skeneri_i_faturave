import { serve } from "https://deno.land/std@0.200.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import OpenAI from "npm:openai";
import * as pdfjs from "npm:pdfjs-dist@4.4.170";
import { createCanvas } from "https://deno.land/x/canvas@v1.4.1/mod.ts";

// Define CORS headers locally to ensure deployment success
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Define the valid subcategories for validation
const validSubcategories = [
  "660-01 Paga bruto", "660-02 Sigurimi shendetesor", "660-03 Kontributi pensional",
  "665-01 Shpenzimet e qirase", "665-02 Material harxhues", "665-03 Pastrimi", "665-04 Ushqim dhe pije",
  "665-05 Shpenzime te IT-se", "665-06 Shpenzimt e perfaqesimit", "665-07 Asete nen 1000 euro", "665-09 Te tjera",
  "667-01 Sherbimet e kontabilitetit", "667-02 Sherbime ligjore", "667-03 Sherbime konsulente", "667-04 Sherbime auditimi",
  "668-01 Akomodimi", "668-02 Meditja", "668-03 Transporti",
  "669-01 Shpenzimet e karburantit", "669-02 Mirembajtje e riparim",
  "675-01 Interneti", "675-02 Telefon mobil", "675-03 Dergesa postare", "675-04 Telefon fiks",
  "683-01 Sigurimi i automjeteve", "683-02 Sigurimi i nderteses",
  "686-01 Energjia elektrike", "686-02 Ujesjellesi", "686-03 Pastrimi", "686-04 Shpenzimet e ngrohjes",
  "690-01 Shpenzimet e anetaresimit", "690-02 Shpenzimet e perkthimit", "690-03 Provizion bankar",
  "690-04 Mirembajtje e webfaqes", "690-05 Taksa komunale", "690-06 Mirembajtje e llogarise bankare",
  "690-09 Te tjera",
];

// Valid VAT codes
const validVatCodes = [
  "[31] Blerjet dhe importet pa TVSH",
  "[32] Blerjet dhe importet investive pa TVSH",
  "[33] Blerjet dhe importet me TVSH jo të zbritshme",
  "[34] Blerjet dhe importet investive me TVSH jo të zbritshme",
  "[35] Importet 18%",
  "[37] Importet 8%",
  "[39] Importet investive 18%",
  "[41] Importet investive 8%",
  "[43] Blerjet vendore 18%",
  "No VAT",
  "[45] Blerjet vendore 8%",
  "[47] Blerjet investive vendore 18%",
  "[49] Blerjet investive vendore 8%",
  "[65] E drejta e kreditimit të TVSH-së në lidhje me Ngarkesën e Kundërt 18%",
  "[28] Blerjet që i nënshtrohen ngarkesës së kundërt 18%",
];

// Valid units (Njesia)
const validUnits = [
  "cope", "kg", "g", "L", "ml", "m", "cm", "m2", "m3", "kWh", "dite", "ore", "muaj", "vit", "pakete", "shishe", "kuti", "tjeter",
];

const getPercentageFromVatCode = (vatCode: string): number => {
  if (vatCode === "No VAT" || vatCode.includes("pa TVSH") || vatCode.includes("jo të zbritshme")) return 0;
  const match = vatCode.match(/(\d+)%/);
  return match ? parseInt(match[1], 10) : 0;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const { storage_path, receiptId } = await req.json();

    if (!receiptId || !storage_path) {
        return new Response(JSON.stringify({ error: "Missing receiptId or storage_path from client." }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Use Admin client to bypass RLS for storage access
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Download the file from storage
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from("receipts")
      .download(storage_path);

    if (downloadError) {
      throw new Error(`Failed to download file from storage: ${downloadError.message}`);
    }

    const fileBuffer = await fileData.arrayBuffer();
    const fileType = fileData.type;
    let base64Images: string[] = [];

    if (fileType === "application/pdf") {
      const pdf = await pdfjs.getDocument(fileBuffer).promise;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext("2d");
        await page.render({ canvasContext: context, viewport }).promise;
        base64Images.push(canvas.toDataURL("image/jpeg", 0.9));
      }
    } else if (fileType.startsWith("image/")) {
      const base64String = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));
      base64Images.push(`data:${fileType};base64,${base64String}`);
    } else {
      throw new Error(`Unsupported file type: ${fileType}`);
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      throw new Error("OpenAI API Key is not configured.");
    }
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const systemPrompt = `You are an expert AI assistant specializing in accurately extracting structured data from receipt images. Your task is to return a clean, valid JSON object based on the user's request, without any additional commentary or explanations.`;
    const chatGptPrompt = `
      Carefully analyze the following receipt image and extract all expense items into a JSON array named "expenses".
      **INSTRUCTION:** You must process every line item individually.
      Each object in the array must have the following fields:
      - "name": (string) The name of the item or service.
      - "category": (string) **IMPORTANT: This MUST be one of the exact strings from the list below.**
      - "amount": (number) The total price of the item.
      - "date": (string) The date of the purchase in YYYY-MM-DD format.
      - "merchant": (string or null) The name of the merchant.
      - "vat_code": (string) MUST be one of: ${validVatCodes.join(", ")}.
      - "tvsh_percentage": (number) Must be 0, 8, or 18 based on the VAT.
      - "nui": (string or null) The unique identification number (NUI) of the merchant.
      - "nr_fiskal": (string or null) The fiscal number (Nr. Fiskal) of the receipt.
      - "numri_i_tvsh_se": (string or null) The VAT number (Numri i TVSH-se) of the merchant.
      - "description": (string or null) A detailed description of the expense item.
      - "sasia": (number) The quantity of the item. If not explicitly found, default to 1.
      - "njesia": (string) The unit of measure. **This MUST be one of the exact strings from the list below.**
      **VALID UNITS:** ${validUnits.join(", ")}
      **VALID CATEGORIES:** ${validSubcategories.join(", ")}
      If any other information is missing, use a reasonable default or null.`;

    let allValidatedExpenses: any[] = [];

    for (const base64Image of base64Images) {
      try {
        const chatCompletion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: chatGptPrompt },
                { type: "image_url", image_url: { url: base64Image, detail: "high" } },
              ],
            },
          ],
          response_format: { type: "json_object" },
          max_tokens: 2000,
        });

        const aiResponseContent = chatCompletion.choices?.[0]?.message?.content;
        if (!aiResponseContent) continue;

        const parsed = JSON.parse(aiResponseContent);
        const extractedExpenses = Array.isArray(parsed.expenses) ? parsed.expenses : [];

        const validatedExpenses = extractedExpenses.map((expense: any) => {
          let vatCode = validVatCodes.includes(expense.vat_code) ? expense.vat_code : "No VAT";
          let category = validSubcategories.includes(expense.category) ? expense.category : "690-09 Te tjera";
          return {
            name: expense.name || "Unknown Item",
            category: category,
            amount: parseFloat(expense.amount) || 0,
            date: expense.date || new Date().toISOString().split("T")[0],
            merchant: expense.merchant || null,
            vat_code: vatCode,
            tvsh_percentage: getPercentageFromVatCode(vatCode),
            nui: expense.nui || null,
            nr_fiskal: expense.nr_fiskal || null,
            numri_i_tvsh_se: expense.numri_i_tvsh_se || null,
            description: expense.description || null,
            sasia: parseFloat(expense.sasia) || 1,
            njesia: validUnits.includes(expense.njesia) ? expense.njesia : "cope",
          };
        });
        allValidatedExpenses.push(...validatedExpenses);
      } catch (error) {
        console.error("Error processing a page with OpenAI:", error.message);
        // Continue to the next page even if one fails
      }
    }

    return new Response(JSON.stringify({
      message: "Receipt processed successfully",
      receiptId: receiptId,
      expenses: allValidatedExpenses,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Unhandled Edge function error:", error?.message);
    return new Response(JSON.stringify({ error: "Internal Server Error", details: error?.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
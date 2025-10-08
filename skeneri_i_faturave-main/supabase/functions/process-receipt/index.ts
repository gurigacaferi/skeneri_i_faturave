import { serve } from "https://deno.land/std@0.200.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import OpenAI from "npm:openai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // change to your domain in production
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Define the valid subcategories for validation
const validSubcategories = [
  "660-01 Paga bruto", "660-02 Sigurimi shendetesor", "660-03 Kontributi pensional",
  "665-01 Shpenzimet e qirase", "665-02 Material harxhues", "665-03 Pastrimi", "665-04 Ushqim dhe pije",
  "665-05 Shpenzime te IT-se", "665-06 Shpenzimt e perfaqesimit", "665-07 Asete nen 1000 euro", "665-09 Te tjera",
  "667-01 Sherbimet e kontabilitetit", "667-02 Sherbime ligjore", "667-03 Sherbime konsulente", "667-04 Sherbime auditimi",
  "668-01 Akomodimi", "668-02 Meditja", "668-03 Transporti",
  "669-01 Shpenzimet e karburantit", "669-02 Mirembajtje dhe riparim",
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

const getPercentageFromVatCode = (vatCode: string): number => {
  if (vatCode === "No VAT" || vatCode.includes("pa TVSH") || vatCode.includes("jo të zbritshme")) return 0;
  const match = vatCode.match(/(\d+)%/);
  return match ? parseInt(match[1], 10) : 0;
};

async function sha256(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  console.log("process-receipt Edge Function invoked. Method:", req.method);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    console.log("Handling OPTIONS request for CORS preflight.");
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const { base64Image, filename, batchId } = await req.json();

    // JWT verification
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized: No Authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid or expired token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: receiptData, error: receiptError } = await supabase
      .from("receipts")
      .insert({ user_id: user.id, filename, batch_id: batchId })
      .select()
      .single();

    if (receiptError) {
      return new Response(JSON.stringify({ error: "Failed to save receipt", details: receiptError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chatGptPrompt = `Extract expense items from this receipt image as a JSON array. Each object in the array should have 'name' (string), 'category' (string, MUST be one of: ${validSubcategories.join(", ")}), 'amount' (number), 'date' (YYYY-MM-DD), 'merchant' (string or null), 'vat_code' (string, MUST be one of: ${validVatCodes.join(", ")}), and 'tvsh_percentage' (0, 8, or 18). If missing info, use null or defaults.`;

    const promptHash = await sha256(user.id + chatGptPrompt + base64Image);

    const { data: cachedResponse } = await supabase
      .from("prompt_cache")
      .select("ai_response")
      .eq("prompt_hash", promptHash)
      .eq("user_id", user.id)
      .single();

    if (cachedResponse) {
      return new Response(JSON.stringify({
        message: "Receipt processed successfully (cached)",
        receiptId: receiptData.id,
        expenses: cachedResponse.ai_response,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return new Response(JSON.stringify({ error: "OpenAI API Key is not configured." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });

    // Make sure the image is a valid data URL
    const imageUrl = base64Image.startsWith("data:")
      ? base64Image
      : `data:image/png;base64,${base64Image}`;

    console.log("Calling GPT-4o model...");
    let chatCompletion;
    try {
      chatCompletion = await openai.chat.completions.create({
        model: "gpt-4o", // ← Reverted to gpt-4o
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: chatGptPrompt },
              { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            ],
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1000,
      });
    } catch (openaiError: any) {
      const status = openaiError?.status || openaiError?.response?.status;
      const data = openaiError?.response?.data;
      console.error("OpenAI API call failed:", openaiError?.message, { status, data });
      return new Response(JSON.stringify({
        error: "Failed to process receipt with AI",
        details: openaiError?.message,
        status,
        openaiPayloadError: data,
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiResponseContent = chatCompletion.choices?.[0]?.message?.content;
    if (!aiResponseContent) throw new Error("OpenAI did not return any content.");

    let extractedExpenses: any[] = [];
    try {
      const parsed = JSON.parse(aiResponseContent);
      if (Array.isArray(parsed)) extractedExpenses = parsed;
      else if (parsed?.expenses) extractedExpenses = parsed.expenses;
    } catch {
      const jsonMatch = aiResponseContent.match(/\[\s*\{.*?\}\s*(?:,\s*\{.*?\}\s*)*\]/s);
      if (jsonMatch?.[0]) extractedExpenses = JSON.parse(jsonMatch[0]);
    }

    // Validate and default categories/VAT codes
    const validatedExpenses = extractedExpenses.map((expense: any) => {
      let vatCode = "No VAT";
      let tvshPercentage = 0;

      if (validVatCodes.includes(expense.vat_code)) {
        vatCode = expense.vat_code;
        tvshPercentage = getPercentageFromVatCode(vatCode);
      } else {
        const found = validVatCodes.find(
          (code) => expense.vat_code && code.toLowerCase().includes(expense.vat_code.toLowerCase()),
        );
        if (found) {
          vatCode = found;
          tvshPercentage = getPercentageFromVatCode(found);
        }
      }

      return {
        name: expense.name || "Unknown Item",
        category: validSubcategories.includes(expense.category) ? expense.category : "690-09 Te tjera",
        amount: parseFloat(expense.amount) || 0,
        date: expense.date || new Date().toISOString().split("T")[0],
        merchant: expense.merchant || null,
        vat_code: vatCode,
        tvsh_percentage: tvshPercentage,
      };
    });

    // Cache the AI response
    const { error: insertCacheError } = await supabase
      .from("prompt_cache")
      .insert({
        user_id: user.id,
        prompt_hash: promptHash,
        ai_response: validatedExpenses,
      });
    if (insertCacheError) console.error("Cache insert error:", insertCacheError.message);

    return new Response(JSON.stringify({
      message: "Receipt processed successfully",
      receiptId: receiptData.id,
      expenses: validatedExpenses,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Unhandled Edge function error:", error?.message);
    return new Response(JSON.stringify({ error: "Internal Server Error", details: error?.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

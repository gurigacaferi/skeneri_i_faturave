import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { receiptId } = await req.json()
    
    if (!receiptId) {
      return new Response(
        JSON.stringify({ error: 'receiptId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get receipt record and read file from storage
    const { data: receipt, error: fetchError } = await supabase
      .from('receipts')
      .select('id, storage_path, user_id, filename')
      .eq('id', receiptId)
      .single()

    if (fetchError || !receipt) {
      await supabase
        .from('receipts')
        .update({ 
          status: 'failed', 
          error_message: 'Receipt not found' 
        })
        .eq('id', receiptId)
      
      return new Response(
        JSON.stringify({ error: 'Receipt not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Read file from storage
    const { data: fileData, error: storageError } = await supabase.storage
      .from('receipts')
      .download(receipt.storage_path)

    if (storageError || !fileData) {
      await supabase
        .from('receipts')
        .update({ 
          status: 'failed', 
          error_message: 'Failed to read file from storage' 
        })
        .eq('id', receiptId)
      
      return new Response(
        JSON.stringify({ error: 'Failed to read file from storage' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Convert to base64
    const buffer = await fileData.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    const base64 = btoa(binary)
    const mimeType = fileData.type || 'application/octet-stream'
    const base64Image = `data:${mimeType};base64,${base64}`

    // Process with OpenAI
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      await supabase
        .from('receipts')
        .update({ 
          status: 'failed', 
          error_message: 'OpenAI API key not configured' 
        })
        .eq('id', receiptId)
      
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Please extract all expense information from this receipt/invoice image. Return a JSON array of expenses with the following structure:

{
  "expenses": [
    {
      "name": "Item name",
      "category": "Category (e.g., Food, Office Supplies, Travel, etc.)",
      "amount": 0.00,
      "date": "YYYY-MM-DD",
      "merchant": "Merchant name",
      "tvsh_percentage": 20,
      "vat_code": "VAT code if available",
      "pageNumber": 1,
      "nui": "NUI number if available",
      "nr_fiskal": "Fiscal number if available", 
      "numri_i_tvsh_se": "VAT number if available",
      "description": "Additional description",
      "sasia": 1,
      "njesia": "Unit (e.g., piece, kg, etc.)"
    }
  ]
}

Important guidelines:
- Extract ALL individual items/expenses from the receipt
- Use appropriate categories (Food, Office Supplies, Travel, Utilities, etc.)
- Set tvsh_percentage to 20 if VAT/TVSH is applied, 0 if no VAT
- Include merchant name from the receipt header
- Use the receipt date, or today's date if not clear
- Return valid JSON only, no additional text
- If no expenses found, return {"expenses": []}`
              },
              {
                type: 'image_url',
                image_url: { url: base64Image }
              }
            ]
          }
        ],
        max_tokens: 4000,
      }),
    })

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      await supabase
        .from('receipts')
        .update({ 
          status: 'failed', 
          error_message: `OpenAI API error: ${errorText}` 
        })
        .eq('id', receiptId)
      
      return new Response(
        JSON.stringify({ error: 'OpenAI API error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const aiResult = await openaiResponse.json()
    let extractedData

    try {
      const content = aiResult.choices[0]?.message?.content
      if (!content) throw new Error('No content in AI response')
      
      extractedData = JSON.parse(content)
      if (!extractedData.expenses || !Array.isArray(extractedData.expenses)) {
        throw new Error('Invalid expense data structure')
      }
    } catch (parseError) {
      await supabase
        .from('receipts')
        .update({ 
          status: 'failed', 
          error_message: 'Failed to parse AI response' 
        })
        .eq('id', receiptId)
      
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Save results to database
    await supabase
      .from('receipts')
      .update({ 
        status: 'processed',
        processed_data: JSON.stringify(extractedData)
      })
      .eq('id', receiptId)

    return new Response(
      JSON.stringify({ success: true, data: extractedData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in process-receipt-async:', error)
    
    const { receiptId } = await req.json().catch(() => ({}))
    if (receiptId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      
      await supabase
        .from('receipts')
        .update({ 
          status: 'failed', 
          error_message: 'Internal server error' 
        })
        .eq('id', receiptId)
    }
    
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
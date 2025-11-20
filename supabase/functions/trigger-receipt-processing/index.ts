import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { receiptId } = await req.json();

    if (!receiptId) {
      throw new Error('receiptId is required');
    }

    // Get the receipt record to get the storage path
    const { data: receipt, error: fetchError } = await supabase
      .from('receipts')
      .select('storage_path, user_id, filename')
      .eq('id', receiptId)
      .single();

    if (fetchError || !receipt) {
      throw new Error('Receipt not found');
    }

    // Trigger async processing by calling process-receipt-async
    // This happens independently of the client connection
    const asyncUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/process-receipt-async`;
    
    fetch(asyncUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ 
        receiptId, 
        storagePath: receipt.storage_path,
        filename: receipt.filename 
      }),
    }).catch(error => {
      console.error('Error triggering async processing:', error);
    });

    // Return immediately - processing continues in background
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Processing started in background',
        receiptId 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in trigger-receipt-processing:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

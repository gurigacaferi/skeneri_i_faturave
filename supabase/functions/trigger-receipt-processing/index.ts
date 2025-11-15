import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { Inngest } from 'https://esm.sh/inngest@3.19.2/deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Inngest client
const inngest = new Inngest({
  id: 'fatural-app',
  eventKey: Deno.env.get('INNGEST_EVENT_KEY'),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { receiptId, storagePath } = await req.json();
    if (!receiptId || !storagePath) {
      throw new Error('receiptId and storagePath are required.');
    }

    // Initialize Supabase client with the user's auth token
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated.');

    // Update receipt status to 'processing'
    const { error: updateError } = await supabase
      .from('receipts')
      .update({ status: 'processing' })
      .eq('id', receiptId);
      
    if (updateError) throw new Error(`Failed to update receipt status: ${updateError.message}`);

    // Send an event to Inngest to start the background job
    await inngest.send({
      name: 'receipt/processing.requested',
      data: {
        receiptId,
        storagePath,
        userId: user.id,
      },
    });

    return new Response(JSON.stringify({ message: 'Receipt processing job triggered.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
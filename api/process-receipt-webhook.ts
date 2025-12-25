import { Client } from '@upstash/qstash';
import { createClient } from '@supabase/supabase-js';

export const config = {
  maxDuration: 300,
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { receiptId } = req.body;

    if (!receiptId) {
      return res.status(400).json({ error: 'receiptId is required' });
    }

    console.log(`[Webhook] Processing receipt: ${receiptId}`);

    // Get auth token from header
    const authToken = req.headers['x-auth-token'];
    if (!authToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Initialize Supabase client
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ error: 'Supabase configuration missing' });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    });

    // Update status to processing
    await supabase
      .from('receipts')
      .update({ status: 'processing' })
      .eq('id', receiptId);

    console.log(`[Webhook] Updated receipt ${receiptId} to processing`);

    // Get the receipt with storage path
    const { data: receipt, error: fetchError } = await supabase
      .from('receipts')
      .select('storage_path, filename')
      .eq('id', receiptId)
      .single();

    if (fetchError || !receipt) {
      throw new Error('Receipt not found');
    }

    console.log(`[Webhook] Fetched receipt data, storage_path: ${receipt.storage_path}`);

    // Call the Supabase edge function for AI processing
    const { data: aiResult, error: aiError } = await supabase.functions.invoke('process-receipt', {
      body: { 
        receiptId,
        storagePath: receipt.storage_path 
      },
    });

    if (aiError) {
      throw new Error(`AI processing failed: ${aiError.message}`);
    }

    console.log(`[Webhook] AI processing complete for receipt ${receiptId}`);
    console.log(`[Webhook] Expenses found: ${aiResult?.expenses?.length || 0}`);

    // Update receipt status to processed
    await supabase
      .from('receipts')
      .update({ status: 'processed' })
      .eq('id', receiptId);

    return res.status(200).json({ 
      success: true, 
      expenses: aiResult?.expenses || [],
      receiptId 
    });

  } catch (error: any) {
    console.error('[Webhook] Processing error:', error);
    
    // Update receipt status to failed
    if (req.body?.receiptId) {
      try {
        const authToken = req.headers['x-auth-token'];
        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        
        if (supabaseUrl && supabaseAnonKey && authToken) {
          const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: `Bearer ${authToken}` } },
          });
          
          await supabase
            .from('receipts')
            .update({ status: 'failed', error_message: error.message })
            .eq('id', req.body.receiptId);
            
          console.log(`[Webhook] Updated receipt ${req.body.receiptId} to failed`);
        }
      } catch (updateError) {
        console.error('[Webhook] Failed to update error status:', updateError);
      }
    }

    return res.status(500).json({ 
      error: error.message || 'Processing failed' 
    });
  }
}

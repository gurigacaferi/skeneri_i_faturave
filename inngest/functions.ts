import { inngest } from './client';
import { createClient } from '@supabase/supabase-js';

export const processReceiptFunction = inngest.createFunction(
  { 
    id: 'process-receipt',
    name: 'Process Receipt with AI'
  },
  { event: 'receipt/uploaded' },
  async ({ event, step }) => {
    const { receiptId, authToken, storagePath } = event.data;

    // Initialize Supabase
    const supabaseUrl = process.env.VITE_SUPABASE_URL!;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    });

    // Update status to processing
    await step.run('update-status-processing', async () => {
      await supabase
        .from('receipts')
        .update({ status: 'processing' })
        .eq('id', receiptId);
      
      return { status: 'processing' };
    });

    // Call Supabase edge function for AI processing
    const result = await step.run('ai-processing', async () => {
      const { data, error } = await supabase.functions.invoke('process-receipt', {
        body: { 
          receiptId,
          storagePath 
        },
      });

      if (error) throw new Error(`AI processing failed: ${error.message}`);
      
      return data;
    });

    // Update status to processed
    await step.run('update-status-processed', async () => {
      await supabase
        .from('receipts')
        .update({ status: 'processed' })
        .eq('id', receiptId);
      
      return { status: 'processed', expenses: result?.expenses?.length || 0 };
    });

    return { 
      receiptId, 
      success: true,
      expensesFound: result?.expenses?.length || 0
    };
  }
);

import { inngest } from '../../inngest/client';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { receiptId, authToken, storagePath } = req.body;

    if (!receiptId || !authToken || !storagePath) {
      return res.status(400).json({ 
        error: 'receiptId, authToken, and storagePath are required' 
      });
    }

    console.log(`[Trigger] Triggering receipt processing for ${receiptId}`);

    // Send event to Inngest
    await inngest.send({
      name: 'receipt/uploaded',
      data: {
        receiptId,
        authToken,
        storagePath
      }
    });

    console.log(`[Trigger] Successfully triggered processing for ${receiptId}`);

    return res.status(200).json({ 
      success: true,
      receiptId 
    });

  } catch (error: any) {
    console.error('[Trigger] Error triggering receipt processing:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to trigger processing' 
    });
  }
}

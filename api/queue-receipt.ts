import { Client } from '@upstash/qstash';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { receiptId, authToken } = req.body;

    if (!receiptId || !authToken) {
      return res.status(400).json({ error: 'receiptId and authToken are required' });
    }

    // Initialize QStash client
    const qstashToken = process.env.QSTASH_TOKEN;
    if (!qstashToken) {
      return res.status(500).json({ error: 'QSTASH_TOKEN not configured' });
    }

    const client = new Client({ token: qstashToken });

    // Get the base URL for the webhook
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : req.headers.origin || 'http://localhost:8080';

    const webhookUrl = `${baseUrl}/api/process-receipt-webhook`;

    console.log(`[Queue] Queueing receipt ${receiptId} to ${webhookUrl}`);

    // Publish to QStash
    const result = await client.publishJSON({
      url: webhookUrl,
      body: {
        receiptId,
      },
      headers: {
        'x-auth-token': authToken,
      },
      retries: 3,
      timeout: '5m', // 5 minute timeout
    });

    console.log(`[Queue] Successfully queued receipt ${receiptId}, messageId: ${result.messageId}`);

    return res.status(200).json({ 
      success: true,
      messageId: result.messageId,
      receiptId 
    });

  } catch (error: any) {
    console.error('[Queue] Error queuing receipt:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to queue receipt' 
    });
  }
}

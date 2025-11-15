import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { receiptId, storagePath } = await request.json();
    if (!receiptId || !storagePath) {
      return new NextResponse(JSON.stringify({ error: 'Missing receiptId or storagePath' }), { status: 400 });
    }

    // Invoke the Supabase Edge Function to trigger the Inngest job
    // The user's access token is passed to the Edge Function for authorization
    const { data, error } = await supabase.functions.invoke('trigger-receipt-processing', {
      body: { receiptId, storagePath },
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      console.error('Supabase Function Invoke Error:', error);
      // The error message from the Edge Function is returned to the client
      return new NextResponse(JSON.stringify({ error: error.message }), { status: 500 });
    }

    // The Edge Function returns a success message if the Inngest job was triggered
    return NextResponse.json(data);

  } catch (error) {
    console.error('API Route Error:', error);
    return new NextResponse(
      JSON.stringify({ error: 'Failed to start processing job.' }),
      { status: 500 }
    );
  }
}
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getReceiptById } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { receiptId: string } }
) {
  const receiptId = params.receiptId;
  const supabase = createRouteHandlerClient({ cookies });

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const receipt = await getReceiptById(receiptId);

    if (!receipt) {
      return new NextResponse(JSON.stringify({ error: 'Receipt not found' }), { status: 404 });
    }

    // Ensure the user is authorized to view this receipt
    if (receipt.user_id !== user.id) {
        return new NextResponse(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }

    return NextResponse.json({
      status: receipt.status,
      errorMessage: receipt.error_message,
      processedAt: receipt.processed_at,
    });
  } catch (error) {
    return new NextResponse(
      JSON.stringify({ error: 'An error occurred while fetching receipt status.' }),
      { status: 500 }
    );
  }
}
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

// Set the maximum file size limit (e.g., 10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Disable Next.js body parser to handle file uploads manually
export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  try {
    // 1. Authentication Check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse Multipart Form Data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size exceeds 10MB limit' }, { status: 400 });
    }

    // 3. Prepare Storage Path and Database Entry
    const fileExtension = file.name.split('.').pop();
    const storagePath = `${user.id}/${uuidv4()}.${fileExtension}`;

    // 4. Insert initial receipt record
    const { data: receiptData, error: receiptError } = await supabase
      .from('receipts')
      .insert({
        user_id: user.id,
        storage_path: storagePath,
        status: 'pending',
        file_name: file.name,
      })
      .select()
      .single();

    if (receiptError || !receiptData) {
      console.error('Database insert error:', receiptError);
      return NextResponse.json({ error: 'Failed to create receipt record' }, { status: 500 });
    }

    const receiptId = receiptData.id;

    // 5. Upload File to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      // Clean up database record if storage upload fails
      await supabase.from('receipts').delete().eq('id', receiptId);
      console.error('Storage upload error:', uploadError);
      return NextResponse.json({ error: 'Failed to upload file to storage' }, { status: 500 });
    }

    // 6. Invoke Supabase Edge Function to trigger processing
    // NOTE: This is the call that is currently failing due to deployment issues.
    const { data: functionData, error: functionError } = await supabase.functions.invoke(
      'trigger-receipt-processing',
      {
        body: { receiptId, storagePath },
      }
    );

    if (functionError) {
      // Update status to failed if the function trigger fails
      await supabase
        .from('receipts')
        .update({ status: 'failed', error_message: `Function trigger failed: ${functionError.message}` })
        .eq('id', receiptId);
      
      console.error('Function invocation error:', functionError);
      // We return a success status for the upload, but include the function error
      // as the receipt status is now 'failed'.
      return NextResponse.json({ 
        message: 'File uploaded, but processing trigger failed.', 
        receiptId,
        functionError: functionError.message
      }, { status: 202 });
    }

    // 7. Success Response
    return NextResponse.json({ 
      message: 'Receipt uploaded and processing job triggered.', 
      receiptId,
      functionResponse: functionData
    }, { status: 200 });

  } catch (error) {
    console.error('General API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
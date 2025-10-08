import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const QUICKBOOKS_CLIENT_ID = Deno.env.get('QUICKBOOKS_CLIENT_ID');
const QUICKBOOKS_CLIENT_SECRET = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
const QUICKBOOKS_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QUICKBOOKS_SANDBOX_API_BASE_URL = 'https://sandbox-quickbooks.api.intuit.com/v3/company'; // Use sandbox for development
const QUICKBOOKS_PRODUCTION_API_BASE_URL = 'https://quickbooks.api.intuit.com/v3/company'; // Use production for live

// Helper to refresh QuickBooks access token
async function refreshQuickBooksAccessToken(refreshToken: string) {
  const authString = btoa(`${QUICKBOOKS_CLIENT_ID}:${QUICKBOOKS_CLIENT_SECRET}`);
  const tokenParams = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetch(QUICKBOOKS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'Authorization': `Basic ${authString}`,
    },
    body: tokenParams.toString(),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Failed to refresh QuickBooks token: ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token, // Refresh token might also be updated
    expiresAt: expiresAt.toISOString(),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify JWT token manually
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized: No Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: `Bearer ${token}` },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('JWT verification failed:', userError?.message);
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!QUICKBOOKS_CLIENT_ID || !QUICKBOOKS_CLIENT_SECRET) {
      throw new Error('QuickBooks API credentials are not set in environment variables.');
    }

    const { batchId } = await req.json();
    if (!batchId) {
      return new Response(JSON.stringify({ error: 'Missing batchId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Fetch QuickBooks integration tokens
    let { data: integration, error: integrationError } = await supabase
      .from('quickbooks_integrations')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (integrationError || !integration) {
      console.error('Error fetching QuickBooks integration:', integrationError?.message);
      return new Response(JSON.stringify({ error: 'QuickBooks integration not found for this user.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Refresh token if expired
    let currentAccessToken = integration.access_token;
    let currentRefreshToken = integration.refresh_token;
    let currentExpiresAt = new Date(integration.expires_at);

    if (currentExpiresAt < new Date()) {
      console.log('QuickBooks access token expired, refreshing...');
      const refreshedTokens = await refreshQuickBooksAccessToken(currentRefreshToken);
      currentAccessToken = refreshedTokens.accessToken;
      currentRefreshToken = refreshedTokens.refreshToken;
      currentExpiresAt = new Date(refreshedTokens.expiresAt);

      // Update tokens in Supabase
      const { error: updateError } = await supabase
        .from('quickbooks_integrations')
        .update({
          access_token: currentAccessToken,
          refresh_token: currentRefreshToken,
          expires_at: currentExpiresAt.toISOString(),
        })
        .eq('id', integration.id);

      if (updateError) {
        console.error('Error updating QuickBooks tokens:', updateError.message);
        throw new Error('Failed to update QuickBooks tokens after refresh.');
      }
      console.log('QuickBooks access token refreshed and updated.');
    }

    // Determine QuickBooks API base URL (use sandbox for now)
    const quickbooksApiBaseUrl = QUICKBOOKS_SANDBOX_API_BASE_URL; // Change to PRODUCTION for live app

    // 3. Fetch expenses for the batch
    const { data: expenses, error: expensesError } = await supabase
      .from('expenses')
      .select('name, category, amount, date, merchant, tvsh_percentage')
      .eq('batch_id', batchId)
      .eq('user_id', user.id);

    if (expensesError) {
      console.error('Error fetching expenses for batch:', expensesError.message);
      return new Response(JSON.stringify({ error: 'Failed to fetch expenses for the batch.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!expenses || expenses.length === 0) {
      return new Response(JSON.stringify({ error: 'No expenses found in the selected batch.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Transform expenses into QuickBooks API format (simplified for example)
    // This is a simplified mapping. In a real app, you'd need to map categories to QuickBooks accounts,
    // handle vendors, tax codes, etc. This example assumes a generic expense.
    const quickbooksExpenses = expenses.map(exp => ({
      Line: [
        {
          Amount: exp.amount,
          DetailType: "AccountBasedExpenseLineDetail",
          AccountBasedExpenseLineDetail: {
            AccountRef: {
              value: "81", // Example: '81' is a common ID for an expense account in QuickBooks sample company
              name: exp.category // You'd map this to an actual QuickBooks account name
            },
            // CustomerRef: { value: "1" }, // Optional: if linking to a customer
            // ClassRef: { value: "1" }, // Optional: if linking to a class
          },
          Description: exp.name,
        },
      ],
      AccountRef: {
        value: "81", // The main expense account for the transaction
      },
      PaymentType: "Cash", // Or "Check", "CreditCard"
      // PrivateNote: `Expense from batch ${batchId}`,
      TxnDate: exp.date,
      // VendorRef: { value: "1" }, // Optional: if linking to a vendor
    }));

    // 5. Make API calls to QuickBooks
    const results = [];
    for (const expensePayload of quickbooksExpenses) {
      const quickbooksResponse = await fetch(
        `${quickbooksApiBaseUrl}/${integration.realm_id}/expense?minorversion=69`, // minorversion for latest features
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentAccessToken}`,
            'Accept': 'application/json',
          },
          body: JSON.stringify(expensePayload),
        }
      );

      const quickbooksData = await quickbooksResponse.json();

      if (!quickbooksResponse.ok) {
        console.error('QuickBooks API error:', quickbooksData);
        results.push({ status: 'failed', expense: expensePayload, error: quickbooksData });
      } else {
        results.push({ status: 'success', expense: expensePayload, data: quickbooksData });
      }
    }

    // 6. Update batch status in Supabase
    const allSuccessful = results.every(r => r.status === 'success');
    const newBatchStatus = allSuccessful ? 'sent' : 'partially_sent';

    const { error: updateBatchError } = await supabase
      .from('expense_batches')
      .update({ status: newBatchStatus })
      .eq('id', batchId)
      .eq('user_id', user.id);

    if (updateBatchError) {
      console.error('Error updating batch status:', updateBatchError.message);
      // Don't throw, as expenses might have been sent successfully
    }

    return new Response(JSON.stringify({ message: 'Batch processing complete', results, newBatchStatus }), {
      status: allSuccessful ? 200 : 207, // 207 Multi-Status if some failed
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Edge function error:', error.message);
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
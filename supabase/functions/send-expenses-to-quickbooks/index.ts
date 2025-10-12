import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const QUICKBOOKS_CLIENT_ID = Deno.env.get('QUICKBOOKS_CLIENT_ID');
const QUICKBOOKS_CLIENT_SECRET = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
const QUICKBOOKS_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QUICKBOOKS_SANDBOX_API_BASE_URL = 'https://sandbox-quickbooks.api.intuit.com/v3/company';
const QUICKBOOKS_PRODUCTION_API_BASE_URL = 'https://quickbooks.api.intuit.com/v3/company';

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
    refreshToken: data.refresh_token,
    expiresAt: expiresAt.toISOString(),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!QUICKBOOKS_CLIENT_ID || !QUICKBOOKS_CLIENT_SECRET) {
      throw new Error('QuickBooks API credentials are not set in environment variables.');
    }

    const { expenses } = await req.json();
    if (!expenses || !Array.isArray(expenses) || expenses.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing or invalid expenses array' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let { data: integration, error: integrationError } = await supabase
      .from('quickbooks_integrations')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (integrationError || !integration) {
      return new Response(JSON.stringify({ error: 'QuickBooks integration not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let currentAccessToken = integration.access_token;
    if (new Date(integration.expires_at) < new Date()) {
      const refreshedTokens = await refreshQuickBooksAccessToken(integration.refresh_token);
      currentAccessToken = refreshedTokens.accessToken;
      await supabase
        .from('quickbooks_integrations')
        .update({
          access_token: refreshedTokens.accessToken,
          refresh_token: refreshedTokens.refreshToken,
          expires_at: refreshedTokens.expiresAt,
        })
        .eq('id', integration.id);
    }

    const quickbooksApiBaseUrl = QUICKBOOKS_SANDBOX_API_BASE_URL;

    async function findOrCreateVendor(vendorName: string, accessToken: string, realmId: string) {
      if (!vendorName) return null;
      const query = `SELECT Id FROM Vendor WHERE DisplayName = '${vendorName.replace(/'/g, "\\'")}'`;
      const queryUrl = `${quickbooksApiBaseUrl}/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=69`;
      const searchResponse = await fetch(queryUrl, { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } });
      const searchData = await searchResponse.json();
      if (searchData?.QueryResponse?.Vendor?.length > 0) {
        return { value: searchData.QueryResponse.Vendor[0].Id };
      }
      const createUrl = `${quickbooksApiBaseUrl}/${realmId}/vendor?minorversion=69`;
      const createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ DisplayName: vendorName }),
      });
      const createData = await createResponse.json();
      if (createResponse.ok && createData?.Vendor?.Id) {
        return { value: createData.Vendor.Id };
      }
      console.error('Failed to find or create vendor:', createData);
      return null;
    }

    const results = [];
    for (const exp of expenses) {
      try {
        const vendorRef = await findOrCreateVendor(exp.merchant, currentAccessToken, integration.realm_id);
        
        // NOTE: These account IDs are common defaults in QuickBooks Sandbox.
        // A production app would require a user-defined mapping.
        const paymentAccountRef = { value: "35" }; // Checking account
        const expenseAccountRef = { value: "81" }; // Office Expenses account

        const expensePayload = {
          AccountRef: paymentAccountRef,
          PaymentType: "Cash",
          TxnDate: exp.date,
          Line: [{
            Amount: exp.amount,
            DetailType: "AccountBasedExpenseLineDetail",
            AccountBasedExpenseLineDetail: { AccountRef: expenseAccountRef },
            Description: exp.name,
          }],
          ...(vendorRef && { EntityRef: vendorRef }),
        };

        const quickbooksResponse = await fetch(
          `${quickbooksApiBaseUrl}/${integration.realm_id}/expense?minorversion=69`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentAccessToken}`, 'Accept': 'application/json' },
            body: JSON.stringify(expensePayload),
          }
        );

        const quickbooksData = await quickbooksResponse.json();
        if (!quickbooksResponse.ok) {
          results.push({ status: 'failed', expenseId: exp.id, error: quickbooksData });
        } else {
          results.push({ status: 'success', expenseId: exp.id, data: quickbooksData });
        }
      } catch (e) {
        results.push({ status: 'failed', expenseId: exp.id, error: { message: e.message } });
      }
    }

    return new Response(JSON.stringify({ message: 'Expenses processed for QuickBooks', results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
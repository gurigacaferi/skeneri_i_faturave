import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const QUICKBOOKS_CLIENT_ID = Deno.env.get('QUICKBOOKS_CLIENT_ID');
const QUICKBOOKS_CLIENT_SECRET = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
const QUICKBOOKS_REDIRECT_URI = Deno.env.get('QUICKBOOKS_REDIRECT_URI'); // e.g., https://<your-project-ref>.supabase.co/functions/v1/quickbooks-oauth/callback
const QUICKBOOKS_AUTH_URL = 'https://app.intuit.com/app/oauth2/v1/authorize';
const QUICKBOOKS_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname; // Use the full pathname for matching

    // Verify JWT token manually for authenticated actions
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

    if (!QUICKBOOKS_CLIENT_ID || !QUICKBOOKS_CLIENT_SECRET || !QUICKBOOKS_REDIRECT_URI) {
      throw new Error('QuickBooks API credentials or redirect URI are not set in environment variables.');
    }

    if (pathname.endsWith('/quickbooks-oauth/initiate')) {
      const params = new URLSearchParams({
        client_id: QUICKBOOKS_CLIENT_ID,
        response_type: 'code',
        scope: 'com.intuit.quickbooks.accounting openid profile email',
        redirect_uri: QUICKBOOKS_REDIRECT_URI,
        state: user.id, // Use user ID as state for security and to link back
      });
      return new Response(JSON.stringify({ authorizeUrl: `${QUICKBOOKS_AUTH_URL}?${params.toString()}` }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else if (pathname.endsWith('/quickbooks-oauth/callback')) {
      const code = url.searchParams.get('code');
      const realmId = url.searchParams.get('realmId'); // QuickBooks Company ID
      const state = url.searchParams.get('state'); // Should be user.id

      if (!code || !realmId || !state) {
        return new Response(JSON.stringify({ error: 'Missing code, realmId, or state in callback' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (state !== user.id) {
        return new Response(JSON.stringify({ error: 'State mismatch, possible CSRF attack' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const authString = btoa(`${QUICKBOOKS_CLIENT_ID}:${QUICKBOOKS_CLIENT_SECRET}`);
      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: QUICKBOOKS_REDIRECT_URI,
      });

      const tokenResponse = await fetch(QUICKBOOKS_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'Authorization': `Basic ${authString}`,
        },
        body: tokenParams.toString(),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        console.error('QuickBooks token exchange failed:', tokenData);
        return new Response(JSON.stringify({ error: 'Failed to exchange code for tokens', details: tokenData }), {
          status: tokenResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { access_token, refresh_token, expires_in } = tokenData;
      const expiresAt = new Date(Date.now() + expires_in * 1000); // expires_in is in seconds

      // Store or update tokens in Supabase
      const { data: existingIntegration, error: fetchError } = await supabase
        .from('quickbooks_integrations')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 means no rows found
        console.error('Error fetching existing QuickBooks integration:', fetchError.message);
        throw new Error('Database error during integration check.');
      }

      if (existingIntegration) {
        const { error: updateError } = await supabase
          .from('quickbooks_integrations')
          .update({
            realm_id: realmId,
            access_token: access_token,
            refresh_token: refresh_token,
            expires_at: expiresAt.toISOString(),
          })
          .eq('id', existingIntegration.id);

        if (updateError) {
          console.error('Error updating QuickBooks integration:', updateError.message);
          throw new Error('Failed to update QuickBooks integration.');
        }
      } else {
        const { error: insertError } = await supabase
          .from('quickbooks_integrations')
          .insert({
            user_id: user.id,
            realm_id: realmId,
            access_token: access_token,
            refresh_token: refresh_token,
            expires_at: expiresAt.toISOString(),
          });

        if (insertError) {
          console.error('Error inserting QuickBooks integration:', insertError.message);
          throw new Error('Failed to save QuickBooks integration.');
        }
      }

      // Redirect back to the client application's main page or a success page
      return new Response(null, {
        status: 303, // See Other
        headers: {
          'Location': `${url.origin}/`, // Redirect to your app's homepage
          ...corsHeaders,
        },
      });

    } else {
      return new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Edge function error:', error.message);
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
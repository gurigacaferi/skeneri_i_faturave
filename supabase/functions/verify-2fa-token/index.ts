import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { authenticator } from 'https://esm.sh/otplib@12.0.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // 1. Simple and robust CORS preflight handler
  if (req.method === 'OPTIONS') {
    return new Response("ok", {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain', // Explicitly set text/plain for preflight
      },
    });
  }

  // 2. The actual logic for POST requests
  try {
    const body = await req.json();
    const { token, userId, action } = body;

    if (!token || !userId || !action) {
      return new Response(JSON.stringify({ error: 'Token, userId, and action are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use Service Role Key to fetch the secret securely (bypassing RLS)
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing.');
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('two_factor_secret, two_factor_enabled')
      .eq('id', userId)
      .single();

    if (profileError || !profile || !profile.two_factor_secret) {
      return new Response(JSON.stringify({ error: '2FA secret not found for user.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const secret = profile.two_factor_secret;
    const isValid = authenticator.check(token, secret);

    if (!isValid) {
      return new Response(JSON.stringify({ valid: false, message: 'Invalid TOTP token.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If verification is successful and the action is 'setup', enable 2FA
    if (action === 'setup') {
      const { error: enableError } = await supabaseAdmin
        .from('profiles')
        .update({ two_factor_enabled: true })
        .eq('id', userId);

      if (enableError) {
        console.error('Error enabling 2FA:', enableError.message);
        throw new Error('Failed to enable 2FA in database.');
      }
    }
    
    // If verification is successful and the action is 'login', we just return valid: true

    return new Response(JSON.stringify({ valid: true, message: 'Token verified successfully.' }), {
      status: 200,
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
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { authenticator } from 'https://esm.sh/otplib@12.0.1';

serve(async (req) => {
  // Simple and robust CORS preflight handler
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204, // No Content is also acceptable and common for preflight
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  // The actual logic for POST requests
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized: No Authorization header' }), {
        status: 401,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
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
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // 1. Generate a new secret
    const secret = authenticator.generateSecret();
    
    // 2. Temporarily store the secret in the profile (it will be confirmed later)
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ two_factor_secret: secret, two_factor_enabled: false })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error saving 2FA secret:', updateError.message);
      throw new Error('Failed to save 2FA secret.');
    }

    // 3. Generate the provisioning URI
    const serviceName = 'Fatural';
    const issuer = 'Fatural';
    const uri = authenticator.keyuri(user.email || user.id, issuer, secret);

    return new Response(JSON.stringify({
      secret: secret,
      uri: uri,
      email: user.email,
      serviceName: serviceName,
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Edge function error:', error.message);
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
});
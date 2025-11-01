import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// --- Inlined TOTP Generation Utility (Proven to work in this environment) ---
const SECRET_LENGTH = 20; // 160 bits for SHA1
const DIGITS = 6;
const PERIOD = 30;

/**
 * Generates a random base32 secret.
 */
function generateSecret(length: number = SECRET_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += base32Chars[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += base32Chars[(value << (5 - bits)) & 31];
  }
  
  return output.replace(/=/g, '');
}

/**
 * Generates the key URI for authenticator apps.
 */
function generateKeyUri(email: string, issuer: string, secret: string): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  const label = `${encodedIssuer}:${encodedEmail}`;
  
  const params = new URLSearchParams({
    secret: secret,
    issuer: issuer,
    algorithm: 'SHA1',
    digits: DIGITS.toString(),
    period: PERIOD.toString(),
  });
  
  return `otpauth://totp/${label}?${params.toString()}`;
}
// --- End of Inlined Utility ---

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response("ok", { status: 200, headers: corsHeaders });
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

    const issuer = 'Fatural';
    const secret = generateSecret();
    const uri = generateKeyUri(user.email!, issuer, secret);
    
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing.');
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Store the secret temporarily for setup verification
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ two_factor_secret: secret, two_factor_enabled: false })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error saving 2FA secret:', updateError.message);
      throw new Error('Failed to save 2FA secret.');
    }

    return new Response(JSON.stringify({
      secret: secret,
      uri: uri,
      email: user.email,
      serviceName: issuer,
    }), {
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
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// --- Inlined TOTP Utility (Corrected) ---
const DIGITS = 6;
const PERIOD = 30;

function base32ToBuffer(base32: string): Uint8Array {
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  base32 = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  
  let bits = 0;
  let value = 0;
  const buffer: number[] = [];

  for (let i = 0; i < base32.length; i++) {
    const index = base32Chars.indexOf(base32[i]);
    if (index === -1) continue;

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      buffer.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(buffer);
}

async function generateHotp(secret: string, counter: number): Promise<string> {
  const secretBuffer = base32ToBuffer(secret);
  
  const counterBuffer = new Uint8Array(8);
  const dataView = new DataView(counterBuffer.buffer);
  dataView.setUint32(4, counter, false); // Use last 4 bytes for counter, big-endian

  const key = await crypto.subtle.importKey(
    'raw',
    secretBuffer,
    { name: 'HMAC', hash: 'SHA-1' }, // CORRECTED: Algorithm object
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC', // CORRECTED: Algorithm name
    key,
    counterBuffer
  );

  const hmac = new Uint8Array(signature);
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = 
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = bin % Math.pow(10, DIGITS);
  return otp.toString().padStart(DIGITS, '0');
}

async function validateTotp(secret: string, token: string, window: number = 1): Promise<boolean> {
  const currentTime = Date.now();
  for (let i = -window; i <= window; i++) {
    const checkTime = currentTime + i * PERIOD * 1000;
    const counter = Math.floor(checkTime / 1000 / PERIOD);
    const generatedToken = await generateHotp(secret, counter);
    if (generatedToken === token) {
      return true;
    }
  }
  return false;
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
    const body = await req.json();
    const { token, userId, action } = body;

    if (!token || !userId || !action) {
      return new Response(JSON.stringify({ error: 'Token, userId, and action are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
      return new Response(JSON.stringify({ valid: false, message: '2FA secret not found for user.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const secret = profile.two_factor_secret;
    const isValid = await validateTotp(secret, token);

    if (!isValid) {
      return new Response(JSON.stringify({ valid: false, message: 'Invalid TOTP token.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'setup') {
      const { error: enableError } = await supabaseAdmin
        .from('profiles')
        .update({ two_factor_enabled: true })
        .eq('id', userId);

      if (enableError) {
        throw new Error('Failed to enable 2FA in database.');
      }
    }

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
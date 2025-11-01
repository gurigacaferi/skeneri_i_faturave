import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// --- Inlined TOTP Utility Start ---
// Based on RFC 6238 (TOTP) and RFC 4226 (HOTP)
// Requires Deno's crypto API for HMAC-SHA1

const ALGORITHM = 'HMAC-SHA1';
const DIGITS = 6;
const PERIOD = 30;

/**
 * Converts a base32 secret string to a Uint8Array buffer.
 */
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

/**
 * Generates a one-time password (HOTP) based on a counter.
 */
async function generateHotp(secret: string, counter: number): Promise<string> {
  const secretBuffer = base32ToBuffer(secret);
  
  // Convert counter to 8-byte buffer (big-endian)
  const counterBuffer = new ArrayBuffer(8);
  const view = new DataView(counterBuffer);
  view.setUint32(4, counter, false); // Set the lower 4 bytes (big-endian)

  const key = await crypto.subtle.importKey(
    'raw',
    secretBuffer,
    { name: ALGORITHM },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    ALGORITHM,
    key,
    counterBuffer
  );

  const hmac = new Uint8Array(signature);
  
  // Dynamic Truncation (RFC 4226, Section 5.4)
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = 
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = bin % Math.pow(10, DIGITS);
  
  return otp.toString().padStart(DIGITS, '0');
}

/**
 * Generates a time-based one-time password (TOTP).
 */
async function generateTotp(secret: string, time: number = Date.now()): Promise<string> {
  const counter = Math.floor(time / 1000 / PERIOD);
  return generateHotp(secret, counter);
}

/**
 * Validates a TOTP token against a secret.
 */
async function validateTotp(secret: string, token: string, window: number = 1): Promise<boolean> {
  const currentTime = Date.now();
  
  // Check current time and surrounding windows
  for (let i = -window; i <= window; i++) {
    const checkTime = currentTime + i * PERIOD * 1000;
    const generatedToken = await generateTotp(secret, checkTime);
    if (generatedToken === token) {
      return true;
    }
  }
  return false;
}

const totp = {
  validateTotp,
};
// --- Inlined TOTP Utility End ---

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
      console.error('Missing required fields in request body.');
      return new Response(JSON.stringify({ error: 'Token, userId, and action are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceRoleKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY is missing.');
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
      console.error(`2FA secret not found for user ${userId}. Error: ${profileError?.message}`);
      return new Response(JSON.stringify({ valid: false, message: '2FA secret not found for user.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const secret = profile.two_factor_secret;
    
    // Use the local TOTP validation function
    const isValid = await totp.validateTotp(secret, token);

    if (!isValid) {
      console.warn(`Invalid TOTP token received for user ${userId}. Token: ${token}`);
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
        console.error('Error enabling 2FA:', enableError.message);
        throw new Error('Failed to enable 2FA in database.');
      }
    }

    console.log(`2FA token verified successfully for user ${userId}. Action: ${action}`);
    return new Response(JSON.stringify({ valid: true, message: 'Token verified successfully.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Unhandled Edge function error in verify-2fa-token:', error.message);
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
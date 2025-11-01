import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { TOTP } from 'https://esm.sh/@levminer/totp@3.1.0?bundle';

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
    const totp = TOTP.generate(user.email!, { issuer });
    const secret = totp.secret;
    const uri = totp.uri;
    
    const { error: updateError } = await supabase
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
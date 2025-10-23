import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateInvitationCode(length = 10) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, expires_in_days = 7 } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 1: Authenticate the requesting user as an admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Unauthorized: No Authorization header');
    const token = authHeader.replace('Bearer ', '');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Unauthorized: Invalid or expired token');

    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('role').eq('id', user.id).single();
    if (profileError || profile?.role !== 'admin') {
      throw new Error('Forbidden: Only administrators can generate invitations.');
    }

    // Step 2: Create the invitation in the database using the service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const code = generateInvitationCode();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expires_in_days);

    const { data: newInvitation, error: insertError } = await supabaseAdmin
      .from('invitations')
      .insert({ email: email.toLowerCase(), code: code, expires_at: expiresAt.toISOString() })
      .select().single();

    if (insertError) throw new Error(`Database error: ${insertError.message}`);

    // Step 3: Send the invitation email using Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) throw new Error('Server configuration error: RESEND_API_KEY is not set.');

    const appUrl = Deno.env.get('SUPABASE_URL')?.split('.co')[0].replace('https://', 'https://www.');
    const invitationLink = `${appUrl}.app/register?code=${code}`;

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'Fatural <onboarding@resend.dev>', // Replace with your desired "from" address
        to: [email],
        subject: 'You are invited to join Fatural',
        html: `
          <h1>Welcome to Fatural!</h1>
          <p>You have been invited to join. Please use the following code to register:</p>
          <h2>${code}</h2>
          <p>Or click the link below:</p>
          <a href="${invitationLink}" target="_blank">Register Now</a>
          <p>This code will expire in ${expires_in_days} days.</p>
        `,
      }),
    });

    if (!resendResponse.ok) {
      const errorBody = await resendResponse.json();
      console.error('Resend API Error:', errorBody);
      throw new Error(`Failed to send email: ${errorBody.message}`);
    }

    return new Response(JSON.stringify({ message: 'Invitation created and sent successfully' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Edge function error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
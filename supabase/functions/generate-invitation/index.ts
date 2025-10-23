import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { Resend } from 'https://esm.sh/resend@3.5.2';

// Define CORS headers directly inside the function to avoid import issues.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to generate a simple, unique code
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
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Authenticate and check user role (using the user's JWT)
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

    // Check if user is an admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: Only administrators can generate invitations.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // CRITICAL CHECK: Ensure Service Role Key is available
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceRoleKey) {
        console.error('SUPABASE_SERVICE_ROLE_KEY is missing from environment variables.');
        return new Response(JSON.stringify({ error: 'Server configuration error: Service Role Key is missing.' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // 2. Use Service Role Client to insert the invitation (bypassing RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const code = generateInvitationCode();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expires_in_days);

    const { data: newInvitation, error: insertError } = await supabaseAdmin
      .from('invitations')
      .insert({
        email: email.toLowerCase(),
        code: code,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting invitation:', insertError.message);
      return new Response(JSON.stringify({ error: 'Failed to create invitation in database.', details: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Send Email using Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('RESEND_API_KEY is missing from environment variables.');
      // Continue execution but log the error, as the invitation is already created
    } else {
      const resend = new Resend(resendApiKey);
      const signupLink = `${req.headers.get('origin')}/login?tab=signup&code=${code}&email=${email}`;
      
      try {
        await resend.emails.send({
          from: 'onboarding@resend.dev', // Use a verified domain or resend.dev
          to: email,
          subject: 'Your Invitation to Fatural',
          html: `
            <p>You have been invited to join Fatural.</p>
            <p>Your invitation code is: <strong>${code}</strong></p>
            <p>This code is valid for ${expires_in_days} days.</p>
            <p>Click the link below to sign up:</p>
            <a href="${signupLink}">Sign Up Now</a>
          `,
        });
        console.log(`Invitation email sent to ${email}`);
      } catch (emailError) {
        console.error('Failed to send invitation email via Resend:', emailError);
      }
    }

    return new Response(JSON.stringify({
      message: 'Invitation created and email sent successfully',
      invitation: {
        email: newInvitation.email,
        code: newInvitation.code,
        expires_at: newInvitation.expires_at,
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Unhandled Edge function error:', error.message);
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
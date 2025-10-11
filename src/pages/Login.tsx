import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/components/SessionContextProvider';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const { session, loading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session) {
      navigate('/');
    }
  }, [session, loading, navigate]);

  if (loading || session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lg text-foreground/70">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-secondary/50">
      <div className="w-full max-w-md bg-card p-8 rounded-xl shadow-lg shadow-black/5">
        <div className="flex flex-col items-center mb-6">
          <img src="/ChatGPT Image Oct 11, 2025, 03_50_14 PM.png" alt="Fatural Logo" className="h-12 w-12 mb-2" />
          <h2 className="text-2xl font-bold text-center text-foreground">Welcome to Fatural!</h2>
        </div>
        <Auth
          supabaseClient={supabase}
          providers={[]}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: 'hsl(var(--primary))',
                  brandAccent: 'hsl(var(--primary) / 0.8)',
                  brandButtonText: 'hsl(var(--primary-foreground))',
                  defaultButtonBackground: 'hsl(var(--card))',
                  defaultButtonBackgroundHover: 'hsl(var(--secondary))',
                  defaultButtonBorder: 'hsl(var(--border))',
                  defaultButtonText: 'hsl(var(--foreground))',
                  inputBackground: 'hsl(var(--background))',
                  inputBorder: 'hsl(var(--border))',
                  inputBorderHover: 'hsl(var(--ring))',
                  inputBorderFocus: 'hsl(var(--ring))',
                  inputText: 'hsl(var(--foreground))',
                  inputLabelText: 'hsl(var(--muted-foreground))',
                  inputPlaceholder: 'hsl(var(--muted-foreground))',
                  messageText: 'hsl(var(--foreground))',
                  messageTextDanger: 'hsl(var(--destructive))',
                  anchorTextColor: 'hsl(var(--primary))',
                  anchorTextColorHover: 'hsl(var(--primary) / 0.8)',
                },
                radii: {
                  borderRadiusButton: 'var(--radius)',
                  buttonBorderRadius: 'var(--radius)',
                  inputBorderRadius: 'var(--radius)',
                },
              },
            },
          }}
          theme="light"
          redirectTo={window.location.origin + '/'}
        />
      </div>
    </div>
  );
};

export default Login;
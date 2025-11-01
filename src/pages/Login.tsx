import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/components/SessionContextProvider';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Loader2 } from 'lucide-react';

// --- Schemas ---
const loginSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});

const signUpSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
  invitation_code: z.string().min(1, { message: 'Invitation code is required' }),
});

const recoverySchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
});

const newPasswordSchema = z.object({
  password: z.string().min(6, { message: 'New password must be at least 6 characters' }),
});

type View = 'login' | 'signup' | 'recovery' | 'update_password';

// --- Components ---

const PasswordUpdateForm: React.FC<{ navigate: (path: string) => void }> = ({ navigate }) => {
  const { session } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof newPasswordSchema>>({
    resolver: zodResolver(newPasswordSchema),
  });

  const handleUpdatePassword = async (values: z.infer<typeof newPasswordSchema>) => {
    if (!session) return;

    setIsSubmitting(true);
    const toastId = showLoading('Updating password...');

    try {
      const { data, error } = await supabase.auth.updateUser({
        password: values.password,
      });

      if (error) throw error;

      showSuccess('Password updated successfully! Redirecting to dashboard...');
      navigate('/');
    } catch (error: any) {
      showError(error.message || 'Failed to update password.');
    } finally {
      dismissToast(toastId);
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set New Password</CardTitle>
        <CardDescription>Enter your new password below.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(handleUpdatePassword)} className="space-y-4">
          <div>
            <Label htmlFor="new-password">New Password</Label>
            <Input id="new-password" type="password" {...form.register('password')} />
            {form.formState.errors.password && <p className="text-sm text-red-500 mt-1">{form.formState.errors.password.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update Password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

const PasswordRecoveryForm: React.FC<{ setView: (view: View) => void }> = ({ setView }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof recoverySchema>>({
    resolver: zodResolver(recoverySchema),
  });

  const handlePasswordRecovery = async (values: z.infer<typeof recoverySchema>) => {
    setIsSubmitting(true);
    const toastId = showLoading('Sending recovery email...');

    try {
      // IMPORTANT: The redirectTo URL must be the URL of this page, 
      // which will handle the session update and display the new password form.
      const redirectToUrl = `${window.location.origin}/login`;

      const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
        redirectTo: redirectToUrl,
      });

      if (error) throw error;

      // We show success even if the email doesn't exist to prevent user enumeration attacks.
      showSuccess('If an account exists, a password reset link has been sent to your email.');
      setView('login'); // Go back to login view
    } catch (error: any) {
      showError(error.message || 'Failed to send recovery email.');
    } finally {
      dismissToast(toastId);
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgot Password</CardTitle>
        <CardDescription>Enter your email address to receive a password reset link.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(handlePasswordRecovery)} className="space-y-4">
          <div>
            <Label htmlFor="recovery-email">Email</Label>
            <Input id="recovery-email" type="email" {...form.register('email')} />
            {form.formState.errors.email && <p className="text-sm text-red-500 mt-1">{form.formState.errors.email.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send Reset Link
          </Button>
          <Button type="button" variant="link" className="w-full" onClick={() => setView('login')} disabled={isSubmitting}>
            Back to Login
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};


// --- Main Component ---

const Login = () => {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Determine initial view based on URL params or session state
  const initialTab = searchParams.get('tab') || 'login';
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>(initialTab as 'login' | 'signup');
  const [view, setView] = useState<View>(initialTab === 'signup' ? 'signup' : 'login');

  // Update form defaults and active tab when URL params change
  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });

  const signUpForm = useForm<z.infer<typeof signUpSchema>>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      email: searchParams.get('email') || '',
      password: '',
      invitation_code: searchParams.get('code') || '',
    },
  });

  useEffect(() => {
    const tab = searchParams.get('tab') || 'login';
    setActiveTab(tab as 'login' | 'signup');
    setView(tab === 'signup' ? 'signup' : 'login');
    
    signUpForm.reset({
      email: searchParams.get('email') || '',
      password: '',
      invitation_code: searchParams.get('code') || '',
    });
  }, [searchParams, signUpForm]);

  useEffect(() => {
    if (!loading && session) {
      // Check if the user is logged in via a recovery token (session.user.email_confirmed_at is null)
      // Supabase typically handles the session update automatically after the email link click.
      // We check if the user is authenticated but the password needs to be updated.
      // A simple way to detect this state is to check if the URL hash contains access_token/refresh_token
      // which indicates a fresh redirect from an email link.
      const hash = window.location.hash;
      if (hash.includes('access_token') && hash.includes('refresh_token')) {
        // Clear the hash to prevent re-triggering the session update logic
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        setView('update_password');
        return;
      }
      
      // If already logged in and not in a password update flow, navigate to home
      if (view !== 'update_password') {
        navigate('/');
      }
    }
  }, [session, loading, navigate, view]);

  const handleLogin = async (values: z.infer<typeof loginSchema>) => {
    setIsSubmitting(true);
    const toastId = showLoading('Signing in...');
    try {
      const { error } = await supabase.auth.signInWithPassword(values);
      if (error) throw error;
      // The onAuthStateChange listener in SessionContextProvider will handle success toast and navigation
    } catch (error: any) {
      showError(error.message || 'Failed to sign in.');
    } finally {
      dismissToast(toastId);
      setIsSubmitting(false);
    }
  };

  const handleSignUp = async (values: z.infer<typeof signUpSchema>) => {
    setIsSubmitting(true);
    const toastId = showLoading('Creating your account...');
    try {
      const { data, error } = await supabase.functions.invoke('sign-up-with-invitation', {
        body: {
          email: values.email,
          password: values.password,
          invitation_code: values.invitation_code,
        },
      });

      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);

      showSuccess('Account created! Please sign in.');
      // Automatically sign in the user after successful sign-up
      await handleLogin({ email: values.email, password: values.password });
    } catch (error: any) {
      showError(error.message || 'Sign up failed. Please check your invitation code and details.');
    } finally {
      dismissToast(toastId);
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lg text-foreground/70">Loading...</p>
      </div>
    );
  }

  // If session exists and we are in the update_password view, show the update form
  if (session && view === 'update_password') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-secondary/50">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-6">
            <img src="/ChatGPT Image Oct 11, 2025, 03_50_14 PM.png" alt="Fatural Logo" className="h-12 w-12 mb-2" />
            <h2 className="text-2xl font-bold text-center text-foreground">Update Password</h2>
          </div>
          <PasswordUpdateForm navigate={navigate} />
        </div>
      </div>
    );
  }

  // If session exists and we are not in update_password view, navigate home (handled by useEffect)
  if (session) {
    return null;
  }

  // Standard login/signup/recovery views
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-secondary/50">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <img src="/ChatGPT Image Oct 11, 2025, 03_50_14 PM.png" alt="Fatural Logo" className="h-12 w-12 mb-2" />
          <h2 className="text-2xl font-bold text-center text-foreground">Welcome to Fatural!</h2>
        </div>
        
        {view === 'recovery' ? (
          <PasswordRecoveryForm setView={setView} />
        ) : (
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'login' | 'signup')} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" onClick={() => setView('login')}>Login</TabsTrigger>
              <TabsTrigger value="signup" onClick={() => setView('signup')}>Sign Up</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <Card>
                <CardHeader>
                  <CardTitle>Login</CardTitle>
                  <CardDescription>Enter your credentials to access your account.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                    <div>
                      <Label htmlFor="login-email">Email</Label>
                      <Input id="login-email" type="email" {...loginForm.register('email')} />
                      {loginForm.formState.errors.email && <p className="text-sm text-red-500 mt-1">{loginForm.formState.errors.email.message}</p>}
                    </div>
                    <div>
                      <Label htmlFor="login-password">Password</Label>
                      <Input id="login-password" type="password" {...loginForm.register('password')} />
                      {loginForm.formState.errors.password && <p className="text-sm text-red-500 mt-1">{loginForm.formState.errors.password.message}</p>}
                    </div>
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Login
                    </Button>
                    <Button type="button" variant="link" className="w-full text-sm" onClick={() => setView('recovery')} disabled={isSubmitting}>
                      Forgot Password?
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="signup">
              <Card>
                <CardHeader>
                  <CardTitle>Sign Up</CardTitle>
                  <CardDescription>You need a valid invitation code to create an account.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={signUpForm.handleSubmit(handleSignUp)} className="space-y-4">
                    <div>
                      <Label htmlFor="signup-email">Email</Label>
                      <Input id="signup-email" type="email" {...signUpForm.register('email')} />
                      {signUpForm.formState.errors.email && <p className="text-sm text-red-500 mt-1">{signUpForm.formState.errors.email.message}</p>}
                    </div>
                    <div>
                      <Label htmlFor="signup-password">Password</Label>
                      <Input id="signup-password" type="password" {...signUpForm.register('password')} />
                      {signUpForm.formState.errors.password && <p className="text-sm text-red-500 mt-1">{signUpForm.formState.errors.password.message}</p>}
                    </div>
                    <div>
                      <Label htmlFor="invitation_code">Invitation Code</Label>
                      <Input id="invitation_code" type="text" {...signUpForm.register('invitation_code')} />
                      {signUpForm.formState.errors.invitation_code && <p className="text-sm text-red-500 mt-1">{signUpForm.formState.errors.invitation_code.message}</p>}
                    </div>
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Sign Up
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default Login;
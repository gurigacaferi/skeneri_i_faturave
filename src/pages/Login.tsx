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
import { Loader2, Lock } from 'lucide-react';

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

const twoFactorSchema = z.object({
  token: z.string().length(6, { message: 'Token must be 6 digits' }),
});

type View = 'login' | 'signup' | 'recovery';
type LoginFormValues = z.infer<typeof loginSchema>;

// --- Components ---

const PasswordRecoveryForm: React.FC<{ setView: (view: View) => void }> = ({ setView }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof recoverySchema>>({
    resolver: zodResolver(recoverySchema),
  });

  const handlePasswordRecovery = async (values: z.infer<typeof recoverySchema>) => {
    setIsSubmitting(true);
    const toastId = showLoading('Sending recovery email...');

    try {
      // Redirect to the new dedicated page
      const redirectToUrl = `${window.location.origin}/update-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
        redirectTo: redirectToUrl,
      });

      if (error) throw error;

      showSuccess('If an account exists, a password reset link has been sent to your email.');
      setView('login');
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

// --- 2FA Verification Component ---

interface TwoFactorVerificationFormProps {
  userId: string;
  onVerificationSuccess: () => void;
  onCancel: () => void;
}

const TwoFactorVerificationForm: React.FC<TwoFactorVerificationFormProps> = ({ userId, onVerificationSuccess, onCancel }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof twoFactorSchema>>({
    resolver: zodResolver(twoFactorSchema),
  });

  const handleVerifyToken = async (values: z.infer<typeof twoFactorSchema>) => {
    setIsSubmitting(true);
    const toastId = showLoading('Verifying 2FA token...');

    try {
      const { data, error } = await supabase.functions.invoke('verify-2fa-token', {
        body: {
          token: values.token,
          userId: userId,
          action: 'login',
        },
      });

      if (error) throw new Error(error.message);
      if (data.error || !data.valid) throw new Error(data.message || 'Invalid token.');

      showSuccess('2FA token verified. Logging in...');
      onVerificationSuccess();
    } catch (error: any) {
      showError(error.message || '2FA verification failed. Please check your token.');
    } finally {
      dismissToast(toastId);
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center text-primary">
          <Lock className="mr-2 h-5 w-5" /> Two-Factor Authentication
        </CardTitle>
        <CardDescription>Enter the 6-digit code from your authenticator app.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(handleVerifyToken)} className="space-y-4">
          <div>
            <Label htmlFor="2fa-token">6-Digit Code</Label>
            <Input id="2fa-token" type="text" inputMode="numeric" {...form.register('token')} maxLength={6} />
            {form.formState.errors.token && <p className="text-sm text-red-500 mt-1">{form.formState.errors.token.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verify Code
          </Button>
          <Button type="button" variant="link" className="w-full" onClick={onCancel} disabled={isSubmitting}>
            Cancel Login
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
  
  // 2FA States
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [pendingLoginUser, setPendingLoginUser] = useState<{ email: string, id: string } | null>(null);

  const initialTab = searchParams.get('tab') || 'login';
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>(initialTab as 'login' | 'signup');
  const [view, setView] = useState<View>(initialTab === 'signup' ? 'signup' : 'login');

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

  // Effect to sync view with URL parameters (e.g., for sign-up links)
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

  // Redirect if a full session is established and 2FA is NOT pending
  useEffect(() => {
    if (!loading && session && !twoFactorRequired) {
      navigate('/');
    }
  }, [session, loading, navigate, twoFactorRequired]);


  const handleLogin = async (values: LoginFormValues) => {
    setIsSubmitting(true);
    const toastId = showLoading('Signing in...');
    
    try {
      // 1. Attempt standard login
      const { data, error } = await supabase.auth.signInWithPassword(values);
      if (error) throw error;
      
      if (data.user) {
        // 2. Check 2FA status using the current user's client
        const { data: profileData } = await supabase
          .from('profiles')
          .select('two_factor_enabled')
          .eq('id', data.user.id)
          .single();

        if (profileData?.two_factor_enabled) {
          // 3. 2FA is required. Sign out the temporary session immediately.
          await supabase.auth.signOut();
          
          // 4. Update state to show the 2FA form.
          setPendingLoginUser({ email: values.email, id: data.user.id });
          setTwoFactorRequired(true);
          
          dismissToast(toastId);
          showError('Two-Factor Authentication required.');
          setIsSubmitting(false);
          return; // Stop here and wait for 2FA input.
        }
      }
      
      // 5. No 2FA, normal login successful.
      dismissToast(toastId);
      showSuccess('Logged in successfully!');
      navigate('/'); // Explicit navigation for non-2FA login
      
    } catch (error: any) {
      dismissToast(toastId);
      setIsSubmitting(false);
      showError(error.message || 'Failed to sign in.');
    }
  };
  
  const handle2FASuccess = async () => {
    if (!pendingLoginUser) return;
    
    // Re-authenticate the user with their password now that the token is verified.
    const password = loginForm.getValues('password');
    
    const { error } = await supabase.auth.signInWithPassword({
      email: pendingLoginUser.email,
      password: password,
    });
    
    if (error) {
      showError('Failed to complete login after 2FA verification.');
      setTwoFactorRequired(false);
      setPendingLoginUser(null);
      return;
    }
    
    // Success, navigate to the dashboard immediately.
    setTwoFactorRequired(false);
    setPendingLoginUser(null);
    navigate('/'); // Explicit navigation after successful 2FA login
  };
  
  const handle2FACancel = () => {
    setTwoFactorRequired(false);
    setPendingLoginUser(null);
    loginForm.reset();
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
      // After successful sign up, attempt to log them in immediately
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-secondary/50">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <img src="/ChatGPT Image Oct 11, 2025, 03_50_14 PM.png" alt="Fatural Logo" className="h-12 w-12 mb-2" />
          <h2 className="text-2xl font-bold text-center text-foreground">Welcome to Fatural!</h2>
        </div>
        
        {view === 'recovery' ? (
          <PasswordRecoveryForm setView={setView} />
        ) : twoFactorRequired && pendingLoginUser ? (
          <TwoFactorVerificationForm 
            userId={pendingLoginUser.id}
            onVerificationSuccess={handle2FASuccess}
            onCancel={handle2FACancel}
          />
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
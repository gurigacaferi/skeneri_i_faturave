import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/components/SessionContextProvider';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Loader2 } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});

const signUpSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
  invitation_code: z.string().min(1, { message: 'Invitation code is required' }),
});

const Login = () => {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });

  const signUpForm = useForm<z.infer<typeof signUpSchema>>({
    resolver: zodResolver(signUpSchema),
  });

  useEffect(() => {
    if (!loading && session) {
      navigate('/');
    }
  }, [session, loading, navigate]);

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

  if (loading || session) {
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
        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Login</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
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
      </div>
    </div>
  );
};

export default Login;
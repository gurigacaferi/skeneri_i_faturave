import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useSession } from '@/components/SessionContextProvider';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Loader2 } from 'lucide-react';

const newPasswordSchema = z.object({
  password: z.string().min(6, { message: 'New password must be at least 6 characters' }),
});

const UpdatePassword = () => {
  const { session, loading, supabase } = useSession();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof newPasswordSchema>>({
    resolver: zodResolver(newPasswordSchema),
  });

  useEffect(() => {
    if (!loading && !session) {
      showError("Invalid or expired session. Please request a new password reset link.");
      navigate('/login');
    }
  }, [session, loading, navigate]);

  const handleUpdatePassword = async (values: z.infer<typeof newPasswordSchema>) => {
    setIsSubmitting(true);
    const toastId = showLoading('Updating password...');

    try {
      const { error } = await supabase.auth.updateUser({
        password: values.password,
      });

      if (error) throw error;

      showSuccess('Password updated successfully! You are now logged in.');
      navigate('/');
    } catch (error: any) {
      showError(error.message || 'Failed to update password.');
    } finally {
      dismissToast(toastId);
      setIsSubmitting(false);
    }
  };

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Verifying session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-secondary/50">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <img src="/ChatGPT Image Oct 11, 2025, 03_50_14 PM.png" alt="Fatural Logo" className="h-12 w-12 mb-2" />
          <h2 className="text-2xl font-bold text-center text-foreground">Set a New Password</h2>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Create Your New Password</CardTitle>
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
                Update Password and Login
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default UpdatePassword;
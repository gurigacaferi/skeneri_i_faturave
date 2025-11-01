import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/components/SessionContextProvider';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, Save } from 'lucide-react';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';

// --- Schemas ---
const profileSchema = z.object({
  first_name: z.string().min(1, 'First name is required').nullable(),
  last_name: z.string().min(1, 'Last name is required').nullable(),
});

const passwordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type ProfileFormValues = z.infer<typeof profileSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;

const ProfileSettings: React.FC = () => {
  const { session, loading: sessionLoading, profile, supabase, refreshProfile } = useSession();
  const navigate = useNavigate();
  const [isProfileSubmitting, setIsProfileSubmitting] = useState(false);
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false);

  // Redirect unauthenticated users
  useEffect(() => {
    if (!sessionLoading && !session) {
      navigate('/login');
    }
  }, [session, sessionLoading, navigate]);

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
    },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      password: '',
    },
  });

  // Sync form defaults when profile loads
  useEffect(() => {
    if (profile) {
      profileForm.reset({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
      });
    }
  }, [profile, profileForm]);

  const handleProfileUpdate = async (values: ProfileFormValues) => {
    if (!session) return;
    setIsProfileSubmitting(true);
    const toastId = showLoading('Updating profile...');

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: values.first_name,
          last_name: values.last_name,
        })
        .eq('id', session.user.id);

      if (error) throw error;

      // Also update auth metadata for consistency (used by handle_new_user trigger)
      const { error: authError } = await supabase.auth.updateUser({
        data: {
          first_name: values.first_name,
          last_name: values.last_name,
        },
      });

      if (authError) console.warn('Failed to update auth metadata:', authError.message);

      await refreshProfile(); // Refresh context profile state
      showSuccess('Profile updated successfully!');
    } catch (error: any) {
      showError(error.message || 'Failed to update profile.');
    } finally {
      dismissToast(toastId);
      setIsProfileSubmitting(false);
    }
  };

  const handlePasswordChange = async (values: PasswordFormValues) => {
    if (!session) return;
    setIsPasswordSubmitting(true);
    const toastId = showLoading('Changing password...');

    try {
      const { error } = await supabase.auth.updateUser({
        password: values.password,
      });

      if (error) throw error;

      showSuccess('Password changed successfully! You will need to log in again soon.');
      passwordForm.reset({ password: '' });
    } catch (error: any) {
      showError(error.message || 'Failed to change password.');
    } finally {
      dismissToast(toastId);
      setIsPasswordSubmitting(false);
    }
  };

  if (sessionLoading || !session) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 h-16 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <img src="/ChatGPT Image Oct 11, 2025, 03_50_14 PM.png" alt="Fatural Logo" className="h-8 w-8" />
            <h1 className="text-xl font-bold text-foreground">
              Profile Settings
            </h1>
          </div>
          <Button onClick={() => navigate('/')} variant="outline">
            Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl space-y-8">
        <h2 className="text-3xl font-bold text-foreground">Account Management</h2>

        {/* Profile Details Card */}
        <Card>
          <CardHeader>
            <CardTitle>Profile Details</CardTitle>
            <CardDescription>Update your personal information.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={profileForm.handleSubmit(handleProfileUpdate)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="first_name">First Name</Label>
                  <Input id="first_name" {...profileForm.register('first_name')} disabled={isProfileSubmitting} />
                  {profileForm.formState.errors.first_name && <p className="text-sm text-red-500 mt-1">{profileForm.formState.errors.first_name.message}</p>}
                </div>
                <div>
                  <Label htmlFor="last_name">Last Name</Label>
                  <Input id="last_name" {...profileForm.register('last_name')} disabled={isProfileSubmitting} />
                  {profileForm.formState.errors.last_name && <p className="text-sm text-red-500 mt-1">{profileForm.formState.errors.last_name.message}</p>}
                </div>
              </div>
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" value={session.user.email || ''} disabled className="bg-muted/50 cursor-not-allowed" />
              </div>
              <Button type="submit" disabled={isProfileSubmitting}>
                {isProfileSubmitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                ) : (
                  <><Save className="mr-2 h-4 w-4" /> Save Details</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Separator />

        {/* Password Change Card */}
        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>Enter a new password to secure your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={passwordForm.handleSubmit(handlePasswordChange)} className="space-y-4">
              <div>
                <Label htmlFor="password">New Password</Label>
                <Input id="password" type="password" {...passwordForm.register('password')} disabled={isPasswordSubmitting} />
                {passwordForm.formState.errors.password && <p className="text-sm text-red-500 mt-1">{passwordForm.formState.errors.password.message}</p>}
              </div>
              <Button type="submit" variant="destructive" disabled={isPasswordSubmitting}>
                {isPasswordSubmitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Changing...</>
                ) : (
                  'Change Password'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ProfileSettings;
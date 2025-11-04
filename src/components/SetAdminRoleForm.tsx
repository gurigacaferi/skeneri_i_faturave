import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useSession } from '@/components/SessionContextProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { Loader2, UserCheck } from 'lucide-react';

const formSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
});

type AdminFormValues = z.infer<typeof formSchema>;

const SetAdminRoleForm: React.FC = () => {
  const { supabase, session } = useSession();
  const [loading, setLoading] = useState(false);

  const form = useForm<AdminFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
    },
  });

  const handleSetAdmin = async (values: AdminFormValues) => {
    if (!session) return;

    setLoading(true);
    const toastId = showLoading(`Setting ${values.email} to admin...`);

    try {
      const { data, error } = await supabase.functions.invoke('set-admin-role', {
        body: { email: values.email },
      });

      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);

      showSuccess(`User ${values.email} is now an administrator!`);
      form.reset();
    } catch (error: any) {
      showError(error.message || 'Failed to set admin role.');
      console.error('Set Admin Role error:', error);
    } finally {
      dismissToast(toastId);
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto shadow-lg border-0">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center">
          <UserCheck className="mr-2 h-6 w-6 text-primary" /> Grant Admin Rights
        </CardTitle>
        <CardDescription>
          Enter the email of the user you wish to promote to administrator.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(handleSetAdmin)} className="space-y-4">
          <div>
            <Label htmlFor="admin-email">User Email</Label>
            <Input
              id="admin-email"
              type="email"
              {...form.register('email')}
              placeholder="user@example.com"
              disabled={loading}
            />
            {form.formState.errors.email && <p className="text-sm text-red-500 mt-1">{form.formState.errors.email.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Promoting...</>
            ) : (
              'Set as Admin'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default SetAdminRoleForm;
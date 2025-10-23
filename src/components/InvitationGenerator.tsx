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
import { Loader2, Mail, Copy } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';

const formSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
});

type InvitationFormValues = z.infer<typeof formSchema>;

interface GeneratedInvitation {
  email: string;
  code: string;
  expires_at: string;
}

const InvitationGenerator: React.FC = () => {
  const { supabase, session } = useSession();
  const [loading, setLoading] = useState(false);
  const [generatedInvitation, setGeneratedInvitation] = useState<GeneratedInvitation | null>(null);

  const form = useForm<InvitationFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
    },
  });

  const handleGenerate = async (values: InvitationFormValues) => {
    if (!session) return;

    setLoading(true);
    setGeneratedInvitation(null);
    const toastId = showLoading('Generating invitation...');

    try {
      const { data, error } = await supabase.functions.invoke('generate-invitation', {
        body: { email: values.email },
      });

      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);

      // Add a check to ensure the invitation data is present
      if (!data || !data.invitation) {
        throw new Error('Server did not return the expected invitation data.');
      }

      setGeneratedInvitation(data.invitation as GeneratedInvitation);
      showSuccess(`Invitation code generated for ${values.email}!`);
      form.reset();
    } catch (error: any) {
      showError(error.message || 'Failed to generate invitation.');
      console.error('Invitation generation error:', error);
    } finally {
      dismissToast(toastId);
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (generatedInvitation?.code) {
      navigator.clipboard.writeText(generatedInvitation.code);
      showSuccess('Invitation code copied to clipboard!');
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto shadow-lg border-0">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center">
          <Mail className="mr-2 h-6 w-6 text-primary" /> Generate Invitation Code
        </CardTitle>
        <CardDescription>
          Create a unique, time-limited code for a new user to sign up.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(handleGenerate)} className="space-y-4">
          <div>
            <Label htmlFor="email">Recipient Email</Label>
            <Input
              id="email"
              type="email"
              {...form.register('email')}
              placeholder="user@example.com"
              disabled={loading}
            />
            {form.formState.errors.email && <p className="text-sm text-red-500 mt-1">{form.formState.errors.email.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>
            ) : (
              'Generate Code'
            )}
          </Button>
        </form>

        {generatedInvitation && (
          <div className="mt-6 pt-6 border-t border-border space-y-4">
            <h3 className="text-lg font-semibold">Generated Code Details:</h3>
            <div className="grid grid-cols-3 gap-4 items-center">
              <Label className="col-span-1">Email:</Label>
              <p className="col-span-2 font-medium truncate">{generatedInvitation.email}</p>
              
              <Label className="col-span-1">Code:</Label>
              <div className="col-span-2 flex items-center space-x-2">
                <Input value={generatedInvitation.code} readOnly className="font-mono text-primary bg-secondary/50 border-primary/50" />
                <Button variant="outline" size="icon" onClick={handleCopyCode} title="Copy Code">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>

              <Label className="col-span-1">Expires:</Label>
              <p className="col-span-2 text-sm text-muted-foreground">
                {format(new Date(generatedInvitation.expires_at), 'MMM dd, yyyy HH:mm')}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default InvitationGenerator;
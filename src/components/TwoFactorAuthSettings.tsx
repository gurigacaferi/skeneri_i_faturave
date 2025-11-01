import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, QrCode, CheckCircle, XCircle, Lock } from 'lucide-react';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import QRCode from 'qrcode';

interface TwoFactorAuthSettingsProps {
  onStatusChange: () => void;
}

const TwoFactorAuthSettings: React.FC<TwoFactorAuthSettingsProps> = ({ onStatusChange }) => {
  const { session, profile, supabase, refreshProfile } = useSession();
  const [loading, setLoading] = useState(false);
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState('');

  const handleGenerateSecret = async () => {
    if (!session) return;
    setLoading(true);
    const toastId = showLoading('Generating 2FA secret...');

    try {
      const { data, error } = await supabase.functions.invoke('generate-2fa-secret');

      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);

      const { secret, uri } = data;
      
      // Generate QR code image URL
      const url = await QRCode.toDataURL(uri);
      
      setSetupSecret(secret);
      setQrCodeUrl(url);
      setIsSetupMode(true);
      showSuccess('Secret generated. Scan the QR code to continue setup.');
    } catch (error: any) {
      showError(error.message || 'Failed to generate 2FA secret.');
      setIsSetupMode(false);
    } finally {
      dismissToast(toastId);
      setLoading(false);
    }
  };

  const handleVerifyAndEnable = async () => {
    if (!session || !verificationToken) return;
    setLoading(true);
    const toastId = showLoading('Verifying token...');

    try {
      const { data, error } = await supabase.functions.invoke('verify-2fa-token', {
        body: {
          token: verificationToken,
          userId: session.user.id,
          action: 'setup', // Tells the function to enable 2FA on success
        },
      });

      if (error) throw new Error(error.message);
      if (data.error || !data.valid) throw new Error(data.message || 'Invalid token.');

      showSuccess('2FA enabled successfully!');
      setIsSetupMode(false);
      setVerificationToken('');
      setSetupSecret(null);
      setQrCodeUrl(null);
      await refreshProfile();
      onStatusChange();
    } catch (error: any) {
      showError(error.message || 'Verification failed. Please check your token.');
    } finally {
      dismissToast(toastId);
      setLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!session) return;
    setLoading(true);
    const toastId = showLoading('Disabling 2FA...');

    try {
      // Clear the secret and disable the flag in one go
      const { error } = await supabase
        .from('profiles')
        .update({ two_factor_enabled: false, two_factor_secret: null })
        .eq('id', session.user.id);

      if (error) throw new Error(error.message);

      showSuccess('2FA disabled successfully.');
      await refreshProfile();
      onStatusChange();
    } catch (error: any) {
      showError(error.message || 'Failed to disable 2FA.');
    } finally {
      dismissToast(toastId);
      setLoading(false);
    }
  };

  if (!profile) {
    return (
      <Card className="border-l-4 border-primary">
        <CardHeader>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <CardDescription>Loading profile data...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (profile.two_factor_enabled) {
    return (
      <Card className="border-l-4 border-green-500">
        <CardHeader>
          <CardTitle className="flex items-center text-green-600">
            <CheckCircle className="mr-2 h-5 w-5" /> 2FA is Enabled
          </CardTitle>
          <CardDescription>Your account is protected with two-factor authentication.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleDisable2FA} variant="destructive" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Disable 2FA'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isSetupMode) {
    return (
      <Card className="border-l-4 border-primary">
        <CardHeader>
          <CardTitle className="flex items-center">
            <QrCode className="mr-2 h-5 w-5" /> Setup 2FA
          </CardTitle>
          <CardDescription>
            Scan the QR code with your authenticator app (e.g., Google Authenticator) and enter the token below to confirm.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {qrCodeUrl && (
            <div className="flex flex-col items-center space-y-4 p-4 border rounded-lg bg-muted/50">
              <img src={qrCodeUrl} alt="2FA QR Code" className="w-48 h-48 border p-2 bg-white" />
              <p className="font-mono text-sm text-center break-all">Secret: {setupSecret}</p>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="token">Verification Code</Label>
            <Input
              id="token"
              type="text"
              placeholder="Enter 6-digit code"
              value={verificationToken}
              onChange={(e) => setVerificationToken(e.target.value)}
              disabled={loading}
              maxLength={6}
            />
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsSetupMode(false)} disabled={loading}>
              Cancel Setup
            </Button>
            <Button onClick={handleVerifyAndEnable} disabled={loading || verificationToken.length !== 6}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Verify & Enable'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Default state: 2FA is disabled
  return (
    <Card className="border-l-4 border-yellow-500">
      <CardHeader>
        <CardTitle className="flex items-center text-yellow-600">
          <Lock className="mr-2 h-5 w-5" /> 2FA is Disabled
        </CardTitle>
        <CardDescription>
          Add an extra layer of security to your account by enabling two-factor authentication.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={handleGenerateSecret} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Enable 2FA'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default TwoFactorAuthSettings;
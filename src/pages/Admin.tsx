import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/components/SessionContextProvider';
import InvitationGenerator from '@/components/InvitationGenerator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Separator } from 'lucide-react';
import { Button } from '@/components/ui/button';

const AdminPage: React.FC = () => {
  const { session, loading, profile, supabase } = useSession();
  const navigate = useNavigate();

  // Role check and redirection
  useEffect(() => {
    if (!loading && !session) {
      navigate('/login');
    } else if (!loading && session && profile?.role !== 'admin') {
      // Redirect non-admins to the home page
      navigate('/');
    }
  }, [session, loading, profile, navigate]);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error.message);
    }
  };

  if (loading || !session || profile?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-lg text-foreground/70 ml-2">Loading Admin Panel...</p>
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
              Admin Panel
            </h1>
          </div>
          <div className="flex space-x-4">
            <Button onClick={() => navigate('/')} variant="outline">
              Back to App
            </Button>
            <Button onClick={handleLogout} variant="outline">
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        <h2 className="text-3xl font-bold mb-6 text-foreground">Administration Tools</h2>
        
        <InvitationGenerator />
      </main>
    </div>
  );
};

export default AdminPage;
import { useSession } from "@/components/SessionContextProvider";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReceiptUpload from "@/components/ReceiptUpload";
import ExpensesList from "@/components/ExpensesList";
import { useDefaultBatch } from "@/hooks/useDefaultBatch";
import { Loader2 } from "lucide-react";

const Index = () => {
  const { session, loading: sessionLoading, supabase, profile } = useSession();
  const navigate = useNavigate();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { selectedBatchId, loadingBatches, refreshBatches } = useDefaultBatch();

  // Handle redirection if user is not logged in
  useEffect(() => {
    if (!sessionLoading && !session) {
      navigate('/login');
    }
  }, [session, sessionLoading, navigate]);

  // Refresh batches when the session is available
  useEffect(() => {
    if (session) {
      refreshBatches();
    }
  }, [session, refreshBatches]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login'); // Redirect to login after sign out
  };

  const handleReceiptProcessed = () => {
    setRefreshTrigger(prev => prev + 1); // Increment to trigger a refresh in ExpensesList
  };

  // Combined loading state
  const isLoading = sessionLoading || loadingBatches;

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-2">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-lg text-muted-foreground">Loading Your Dashboard...</p>
        </div>
      </div>
    );
  }

  // If not loading and still no session, the redirect is in progress.
  // Render nothing to avoid a flash of content.
  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen w-full">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 h-16 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <img src="/ChatGPT Image Oct 11, 2025, 03_50_14 PM.png" alt="Fatural Logo" className="h-8 w-8" />
            <h1 className="text-xl font-bold text-foreground">
              Fatural
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            {profile?.role === 'admin' && (
              <Button onClick={() => navigate('/admin')} variant="secondary">
                Admin Panel
              </Button>
            )}
            <Button onClick={handleLogout} variant="outline">
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-secondary p-1 h-11 rounded-lg">
            <TabsTrigger value="upload" className="text-md data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md">Upload Receipt</TabsTrigger>
            <TabsTrigger value="expenses" className="text-md data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md">Expenses</TabsTrigger>
          </TabsList>
          <TabsContent value="upload" className="mt-6">
            <ReceiptUpload onReceiptProcessed={handleReceiptProcessed} selectedBatchId={selectedBatchId} />
          </TabsContent>
          <TabsContent value="expenses" className="mt-6">
            <ExpensesList refreshTrigger={refreshTrigger} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
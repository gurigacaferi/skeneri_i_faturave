import { useSession } from "@/components/SessionContextProvider";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReceiptUpload from "@/components/ReceiptUpload";
import ExpensesList from "@/components/ExpensesList";
import { useDefaultBatch } from "@/hooks/useDefaultBatch";

const Index = () => {
  const { session, loading, supabase, profile } = useSession();
  const navigate = useNavigate();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { selectedBatchId, loadingBatches, refreshBatches } = useDefaultBatch();

  // Handle redirection if not authenticated
  useEffect(() => {
    if (!loading && !session) {
      navigate('/login');
    }
  }, [session, loading, navigate]);

  useEffect(() => {
    if (session) {
      refreshBatches();
    }
  }, [session, refreshBatches]);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error.message);
    }
  };

  if (loading || loadingBatches || !session) {
    // Show loading state while checking session or fetching batch, 
    // or return null if redirect is pending (handled by useEffect)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lg text-foreground/70">Loading...</p>
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
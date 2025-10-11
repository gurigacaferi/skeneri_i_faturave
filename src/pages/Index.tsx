import { useSession } from "@/components/SessionContextProvider";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReceiptUpload from "@/components/ReceiptUpload";
import ExpensesList from "@/components/ExpensesList";
import { useDefaultBatch } from "@/hooks/useDefaultBatch";

const Index = () => {
  const { session, loading, supabase } = useSession();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const { selectedBatchId, loadingBatches, refreshBatches } = useDefaultBatch();

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

  const handleReceiptProcessed = () => {
    setRefreshKey(prevKey => prevKey + 1);
    refreshBatches();
  };

  if (loading || loadingBatches) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lg text-foreground/70">Loading...</p>
      </div>
    );
  }

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
          <Button onClick={handleLogout} variant="outline">
            Logout
          </Button>
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
            <ExpensesList key={`expenses-${refreshKey}`} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
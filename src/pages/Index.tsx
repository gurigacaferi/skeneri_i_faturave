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
    refreshBatches(); // Refresh batches to update total_amount
  };

  if (loading || loadingBatches) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <p className="text-lg text-gray-700 dark:text-gray-300">Loading authentication and batches...</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col items-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="w-full max-w-5xl flex justify-between items-center mb-8 mt-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Expense Tracker</h1>
        <Button onClick={handleLogout} variant="destructive">
          Logout
        </Button>
      </div>

      <Tabs defaultValue="upload" className="w-full max-w-5xl">
        <TabsList className="grid w-full grid-cols-2"> {/* Changed from grid-cols-3 to grid-cols-2 */}
          <TabsTrigger value="upload">Upload Receipt</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
        </TabsList>
        <TabsContent value="upload" className="mt-6">
          <ReceiptUpload onReceiptProcessed={handleReceiptProcessed} selectedBatchId={selectedBatchId} />
        </TabsContent>
        <TabsContent value="expenses" className="mt-6">
          <ExpensesList key={`expenses-${refreshKey}`} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Index;
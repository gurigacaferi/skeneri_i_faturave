import { useSession } from "@/components/SessionContextProvider";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReceiptUpload from "@/components/ReceiptUpload";
import ExpensesList from "@/components/ExpensesList";
import MonthlyReport from "@/components/MonthlyReport";
import BatchManager from "@/components/BatchManager";

const Index = () => {
  const { session, loading, supabase } = useSession();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session) {
      navigate('/login');
    }
  }, [session, loading, navigate]);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error.message);
    }
  };

  const handleReceiptProcessed = () => {
    setRefreshKey(prevKey => prevKey + 1);
  };

  const handleBatchSelected = (batchId: string | null) => {
    setSelectedBatchId(batchId);
    setRefreshKey(prevKey => prevKey + 1);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <p className="text-lg text-gray-700 dark:text-gray-300">Loading authentication...</p>
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

      <Tabs defaultValue="batches" className="w-full max-w-5xl">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="batches">Manage Batches</TabsTrigger>
          <TabsTrigger value="upload">Upload Receipt</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="report">Monthly Report</TabsTrigger>
        </TabsList>
        <TabsContent value="batches" className="mt-6">
          <BatchManager onBatchSelected={handleBatchSelected} selectedBatchId={selectedBatchId} />
        </TabsContent>
        <TabsContent value="upload" className="mt-6">
          <ReceiptUpload onReceiptProcessed={handleReceiptProcessed} selectedBatchId={selectedBatchId} />
        </TabsContent>
        <TabsContent value="expenses" className="mt-6">
          <ExpensesList key={`expenses-${refreshKey}`} />
        </TabsContent>
        <TabsContent value="report" className="mt-6">
          <MonthlyReport key={`report-${refreshKey}`} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Index;
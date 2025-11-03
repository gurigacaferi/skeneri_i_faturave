import { useSession } from "@/components/SessionContextProvider";
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReceiptUpload from "@/components/ReceiptUpload";
import { useDefaultBatch } from "@/hooks/useDefaultBatch";
import { Loader2 } from "lucide-react";
import ProfileButton from "@/components/ProfileButton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { showError } from '@/utils/toast';
import { format } from 'date-fns';

interface Receipt {
  id: string;
  created_at: string;
  status: 'processing' | 'processed' | 'failed';
  filename: string;
  expenses: { merchant: string | null, amount: number }[];
}

const Index = () => {
  const { session, loading: sessionLoading, supabase } = useSession();
  const navigate = useNavigate();
  const { selectedBatchId, loadingBatches } = useDefaultBatch();

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoadingReceipts, setIsLoadingReceipts] = useState(true);

  const fetchReceipts = useCallback(async () => {
    if (!session) return;
    setIsLoadingReceipts(true);
    try {
      const { data, error } = await supabase
        .from('receipts')
        .select(`
          id,
          created_at,
          status,
          filename,
          expenses ( merchant, amount )
        `)
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReceipts(data as Receipt[]);
    } catch (error: any) {
      showError('Failed to fetch receipts: ' + error.message);
    } finally {
      setIsLoadingReceipts(false);
    }
  }, [session, supabase]);

  useEffect(() => {
    if (session) {
      fetchReceipts();
    }
  }, [session, fetchReceipts]);

  useEffect(() => {
    if (!sessionLoading && !session) {
      navigate('/login');
    }
  }, [session, sessionLoading, navigate]);

  const handleReceiptProcessed = () => {
    fetchReceipts(); // Re-fetch the receipts list to show the new entry
  };

  const handleEdit = (receiptId: string) => {
    navigate(`/review-receipt/${receiptId}`);
  };

  const getMerchantName = (receipt: Receipt) => {
    if (receipt.expenses && receipt.expenses.length > 0) {
      return receipt.expenses.find(e => e.merchant)?.merchant || 'N/A';
    }
    return 'Processing...';
  };

  const getTotalAmount = (receipt: Receipt) => {
    if (receipt.expenses && receipt.expenses.length > 0) {
      return receipt.expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0).toFixed(2);
    }
    return '0.00';
  };

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
            <ProfileButton />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="receipts" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-secondary p-1 h-11 rounded-lg">
            <TabsTrigger value="receipts" className="text-md data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md">My Receipts</TabsTrigger>
            <TabsTrigger value="upload" className="text-md data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md">Upload New</TabsTrigger>
          </TabsList>
          
          <TabsContent value="receipts" className="mt-6">
            <Card className="w-full max-w-5xl mx-auto shadow-lg shadow-black/5 border-0">
              <CardHeader>
                <CardTitle className="text-2xl">Receipt History</CardTitle>
                <CardDescription>A list of all your uploaded receipts.</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingReceipts ? (
                  <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : receipts.length === 0 ? (
                  <div className="text-center py-12 text-foreground/60">
                    <p>You have no receipts yet.</p>
                    <p className="text-sm">Switch to the 'Upload New' tab to get started!</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                          <TableHead>Date</TableHead>
                          <TableHead>Filename</TableHead>
                          <TableHead>Merchant</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {receipts.map((receipt) => (
                          <TableRow key={receipt.id}>
                            <TableCell>{format(new Date(receipt.created_at), 'PP')}</TableCell>
                            <TableCell className="font-medium">{receipt.filename}</TableCell>
                            <TableCell>{getMerchantName(receipt)}</TableCell>
                            <TableCell className="text-right">${getTotalAmount(receipt)}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant={
                                receipt.status === 'processed' ? 'default' :
                                receipt.status === 'failed' ? 'destructive' : 'secondary'
                              }>
                                {receipt.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {(receipt.status === 'processed' || receipt.status === 'failed') && (
                                 <Button variant="outline" size="sm" onClick={() => handleEdit(receipt.id)}>
                                   Review / Edit
                                 </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="upload" className="mt-6">
            <ReceiptUpload onReceiptProcessed={handleReceiptProcessed} selectedBatchId={selectedBatchId} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
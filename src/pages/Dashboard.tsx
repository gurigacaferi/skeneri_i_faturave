'use client';

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/components/SessionContextProvider';
import { FileUploader } from '@/components/FileUploader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { showError } from '@/utils/toast';
import { format } from 'date-fns';

interface Receipt {
  id: string;
  created_at: string;
  status: 'processing' | 'processed' | 'failed';
  user_id: string;
  image_url: string;
  // This will be populated by a join
  expenses: { merchant: string | null, amount: number }[];
}

const Dashboard = () => {
  const { supabase, session } = useSession();
  const navigate = useNavigate();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchReceipts = async () => {
      if (!supabase || !session) return;
      setIsLoading(true);
      try {
        // Fetch receipts and their related expenses in one go
        const { data, error } = await supabase
          .from('receipts')
          .select(`
            id,
            created_at,
            status,
            image_url,
            expenses ( merchant, amount )
          `)
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setReceipts(data as Receipt[]);
      } catch (error: any) {
        showError('Failed to fetch receipts: ' + error.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReceipts();
  }, [supabase, session]);

  const handleEdit = (receiptId: string) => {
    navigate(`/review-receipt/${receiptId}`);
  };

  const getMerchantName = (receipt: Receipt) => {
    if (receipt.expenses && receipt.expenses.length > 0) {
      // Return the first non-null merchant name
      return receipt.expenses.find(e => e.merchant)?.merchant || 'N/A';
    }
    return 'N/A';
  };

  const getTotalAmount = (receipt: Receipt) => {
    if (receipt.expenses && receipt.expenses.length > 0) {
      return receipt.expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0).toFixed(2);
    }
    return '0.00';
  };

  return (
    <div className="container mx-auto p-4 md:p-8">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <FileUploader />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>My Receipts</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading receipts...</p>
          ) : receipts.length === 0 ? (
            <p>You have no receipts yet. Upload one to get started!</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((receipt) => (
                  <TableRow key={receipt.id}>
                    <TableCell>{format(new Date(receipt.created_at), 'PP')}</TableCell>
                    <TableCell>{getMerchantName(receipt)}</TableCell>
                    <TableCell>${getTotalAmount(receipt)}</TableCell>
                    <TableCell>
                      <Badge variant={receipt.status === 'processed' ? 'default' : 'secondary'}>
                        {receipt.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {receipt.status === 'processed' && (
                         <Button variant="outline" size="sm" onClick={() => handleEdit(receipt.id)}>
                           Edit
                         </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
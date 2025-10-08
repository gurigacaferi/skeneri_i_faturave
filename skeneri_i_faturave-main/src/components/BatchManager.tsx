import React, { useState, useEffect } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Loader2, PlusCircle, CheckCircle2, Trash2, Pencil, Link, Download, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { exportExpensesToCsv } from '@/utils/exportToCsv'; // Import the new utility

interface ExpenseBatch {
  id: string;
  name: string;
  description: string | null;
  total_amount: number;
  status: string;
  created_at: string;
}

interface Expense {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: string;
  merchant: string | null;
  tvsh_percentage: number;
  vat_code: string | null; // Allow vat_code to be null
  created_at: string;
}

interface BatchManagerProps {
  onBatchSelected: (batchId: string | null) => void;
  selectedBatchId: string | null;
}

const BatchManager: React.FC<BatchManagerProps> = ({ onBatchSelected, selectedBatchId }) => {
  const { supabase, session } = useSession();
  const [batches, setBatches] = useState<ExpenseBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBatchFormOpen, setIsBatchFormOpen] = useState(false);
  const [newBatchName, setNewBatchName] = useState('');
  const [newBatchDescription, setNewBatchDescription] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);
  const [editingBatch, setEditingBatch] = useState<ExpenseBatch | null>(null);
  const [isConnectedToQuickBooks, setIsConnectedToQuickBooks] = useState(false);
  const [connectingQuickBooks, setConnectingQuickBooks] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [sendingBatch, setSendingBatch] = useState(false); // State for sending batch to QuickBooks

  const fetchBatches = async () => {
    if (!session) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('expense_batches')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      showError('Failed to fetch expense batches: ' + error.message);
      console.error('Error fetching expense batches:', error);
    } else {
      setBatches(data || []);
      if (!selectedBatchId && data && data.length > 0) {
        onBatchSelected(data[0].id);
      } else if (!selectedBatchId && data && data.length === 0) {
        onBatchSelected(null);
      } else if (selectedBatchId && !data.some(batch => batch.id === selectedBatchId)) {
        onBatchSelected(data.length > 0 ? data[0].id : null);
      }
    }
    setLoading(false);
  };

  const checkQuickBooksConnection = async () => {
    if (!session) return;
    const { data, error } = await supabase
      .from('quickbooks_integrations')
      .select('id')
      .eq('user_id', session.user.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
      console.error('Error checking QuickBooks connection:', error.message);
      setIsConnectedToQuickBooks(false);
    } else if (data) {
      setIsConnectedToQuickBooks(true);
    } else {
      setIsConnectedToQuickBooks(false);
    }
  };

  useEffect(() => {
    fetchBatches();
    checkQuickBooksConnection();
  }, [session]);

  const handleOpenCreateBatch = () => {
    setEditingBatch(null);
    setNewBatchName('');
    setNewBatchDescription('');
    setIsBatchFormOpen(true);
  };

  const handleOpenEditBatch = (batch: ExpenseBatch) => {
    setEditingBatch(batch);
    setNewBatchName(batch.name);
    setNewBatchDescription(batch.description || '');
    setIsBatchFormOpen(true);
  };

  const handleSaveBatch = async () => {
    if (!newBatchName.trim()) {
      showError('Batch name cannot be empty.');
      return;
    }
    if (!session) {
      showError('You must be logged in to save a batch.');
      return;
    }

    setFormLoading(true);
    const toastId = showLoading(editingBatch ? 'Updating expense batch...' : 'Creating new expense batch...');

    try {
      if (editingBatch) {
        const { data, error } = await supabase
          .from('expense_batches')
          .update({
            name: newBatchName.trim(),
            description: newBatchDescription.trim() || null,
          })
          .eq('id', editingBatch.id)
          .eq('user_id', session.user.id)
          .select()
          .single();

        if (error) {
          throw new Error(error.message);
        }
        showSuccess('Expense batch updated successfully!');
      } else {
        const { data, error } = await supabase
          .from('expense_batches')
          .insert({
            user_id: session.user.id,
            name: newBatchName.trim(),
            description: newBatchDescription.trim() || null,
          })
          .select()
          .single();

        if (error) {
          throw new Error(error.message);
        }
        showSuccess('Expense batch created successfully!');
        onBatchSelected(data.id);
      }

      setNewBatchName('');
      setNewBatchDescription('');
      setIsBatchFormOpen(false);
      fetchBatches();
    } catch (error: any) {
      showError('Failed to save batch: ' + error.message);
      console.error('Error saving batch:', error);
    } finally {
      dismissToast(toastId);
      setFormLoading(false);
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    if (!session) {
      showError('You must be logged in to delete batches.');
      return;
    }

    setDeletingBatchId(batchId);
    const toastId = showLoading('Deleting expense batch...');

    try {
      const { error } = await supabase
        .from('expense_batches')
        .delete()
        .eq('id', batchId)
        .eq('user_id', session.user.id);

      if (error) {
        throw new Error(error.message);
      }

      showSuccess('Expense batch deleted successfully!');
      fetchBatches();
    } catch (error: any) {
      showError('Failed to delete batch: ' + error.message);
      console.error('Error deleting batch:', error);
    } finally {
      dismissToast(toastId);
      setDeletingBatchId(null);
    }
  };

  const handleConnectQuickBooks = async () => {
    if (!session) {
      showError('You must be logged in to connect to QuickBooks.');
      return;
    }
    setConnectingQuickBooks(true);
    const toastId = showLoading('Initiating QuickBooks connection...');

    try {
      const response = await fetch(
        `https://azkeakdwogyoajsmdhdq.supabase.co/functions/v1/quickbooks-oauth/initiate`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to initiate QuickBooks connection.');
      }

      dismissToast(toastId);
      window.location.href = data.authorizeUrl; // Redirect to QuickBooks for authorization
    } catch (error: any) {
      dismissToast(toastId);
      showError('Failed to connect to QuickBooks: ' + error.message);
      console.error('QuickBooks connection error:', error);
    } finally {
      setConnectingQuickBooks(false);
    }
  };

  const handleSendBatchToQuickBooks = async () => {
    if (!session) {
      showError('You must be logged in to send batches to QuickBooks.');
      return;
    }
    if (!selectedBatchId) {
      showError('Please select a batch to send to QuickBooks.');
      return;
    }

    setSendingBatch(true);
    const toastId = showLoading('Sending batch to QuickBooks...');

    try {
      const response = await fetch(
        `https://azkeakdwogyoajsmdhdq.supabase.co/functions/v1/send-batch-to-quickbooks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ batchId: selectedBatchId }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send batch to QuickBooks.');
      }

      showSuccess('Batch sent to QuickBooks successfully!');
      fetchBatches(); // Refresh to update batch status
    } catch (error: any) {
      showError('Failed to send batch to QuickBooks: ' + error.message);
      console.error('QuickBooks send error:', error);
    } finally {
      dismissToast(toastId);
      setSendingBatch(false);
    }
  };

  const handleExportBatchToCsv = async () => {
    if (!session) {
      showError('You must be logged in to export expenses.');
      return;
    }
    if (!selectedBatchId) {
      showError('Please select a batch to export.');
      return;
    }

    setExportingCsv(true);
    const toastId = showLoading('Preparing CSV export...');

    try {
      // Include vat_code in the select query to get the actual VAT codes
      const { data: expenses, error: expensesError } = await supabase
        .from('expenses')
        .select('id, name, category, amount, date, merchant, tvsh_percentage, vat_code, created_at')
        .eq('batch_id', selectedBatchId)
        .eq('user_id', session.user.id);

      if (expensesError) {
        throw new Error(expensesError.message);
      }

      if (!expenses || expenses.length === 0) {
        showError('No expenses found in the selected batch to export.');
        return;
      }

      const selectedBatch = batches.find(batch => batch.id === selectedBatchId);
      const batchName = selectedBatch ? selectedBatch.name : 'Unknown_Batch';

      exportExpensesToCsv(expenses, batchName);
      showSuccess('Expenses exported to CSV successfully!');
    } catch (error: any) {
      showError('Failed to export expenses to CSV: ' + error.message);
      console.error('CSV export error:', error);
    } finally {
      dismissToast(toastId);
      setExportingCsv(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Manage Expense Batches</CardTitle>
        <CardDescription>Create new batches or select an existing one to group your receipts.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4 mb-6">
          <Button onClick={handleOpenCreateBatch}>
            <PlusCircle className="mr-2 h-4 w-4" /> Create New Batch
          </Button>
          <Button
            onClick={handleConnectQuickBooks}
            variant={isConnectedToQuickBooks ? 'secondary' : 'default'}
            disabled={connectingQuickBooks}
          >
            {connectingQuickBooks ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : isConnectedToQuickBooks ? (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            ) : (
              <Link className="mr-2 h-4 w-4" />
            )}
            {isConnectedToQuickBooks ? 'QuickBooks Connected' : 'Connect to QuickBooks'}
          </Button>
          <Button
            onClick={handleSendBatchToQuickBooks}
            disabled={!selectedBatchId || sendingBatch || !isConnectedToQuickBooks}
            variant="default"
          >
            {sendingBatch ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Send Selected Batch to QuickBooks
          </Button>
          <Button
            onClick={handleExportBatchToCsv}
            disabled={!selectedBatchId || exportingCsv}
            variant="outline"
          >
            {exportingCsv ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export Selected Batch to CSV
          </Button>
        </div>

        {batches.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400">No expense batches found. Create one to get started!</p>
        ) : (
          <div className="space-y-4">
            {batches.map((batch) => (
              <div
                key={batch.id}
                className={`flex items-center justify-between p-4 border rounded-lg transition-colors ${
                  selectedBatchId === batch.id
                    ? 'border-primary bg-primary/10'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <div className="flex-grow cursor-pointer" onClick={() => onBatchSelected(batch.id)}>
                  <h3 className="font-semibold text-lg">{batch.name}</h3>
                  {batch.description && <p className="text-sm text-gray-600 dark:text-gray-400">{batch.description}</p>}
                  <p className="text-xs text-gray-500 dark:text-gray-500">Created: {format(new Date(batch.created_at), 'MMM dd, yyyy')}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">Status: {batch.status}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-md font-medium">${batch.total_amount.toFixed(2)}</span>
                  {selectedBatchId === batch.id && <CheckCircle2 className="h-5 w-5 text-primary" />}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-blue-500 hover:text-blue-700"
                    onClick={() => handleOpenEditBatch(batch)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete the expense batch "{batch.name}" and all associated expenses.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDeleteBatch(batch.id)}
                          disabled={deletingBatchId === batch.id}
                          className="bg-red-500 hover:red-600 text-white"
                        >
                          {deletingBatchId === batch.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            'Delete'
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={isBatchFormOpen} onOpenChange={setIsBatchFormOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{editingBatch ? 'Edit Expense Batch' : 'Create New Expense Batch'}</DialogTitle>
              <DialogDescription>
                {editingBatch ? 'Update the details of your expense batch.' : 'Give your new batch a name and an optional description.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="batchName" className="text-right">
                  Name
                </Label>
                <Input
                  id="batchName"
                  value={newBatchName}
                  onChange={(e) => setNewBatchName(e.target.value)}
                  className="col-span-3"
                  disabled={formLoading}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="batchDescription" className="text-right">
                  Description
                </Label>
                <Textarea
                  id="batchDescription"
                  value={newBatchDescription}
                  onChange={(e) => setNewBatchDescription(e.target.value)}
                  className="col-span-3"
                  disabled={formLoading}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsBatchFormOpen(false)} disabled={formLoading}>
                Cancel
              </Button>
              <Button onClick={handleSaveBatch} disabled={formLoading}>
                {formLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {editingBatch ? 'Saving...' : 'Creating...'}
                  </>
                ) : (
                  editingBatch ? 'Save changes' : 'Create Batch'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default BatchManager;
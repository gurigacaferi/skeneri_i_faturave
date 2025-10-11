import React, { useEffect, useState } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { showError } from '@/utils/toast';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';

interface Expense {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: string;
  merchant: string | null;
  tvsh_percentage: number;
  vat_code: string | null;
  receipt_id: string; // Added receipt_id to link to the image
}

interface Receipt {
  id: string;
  image_url: string;
}

interface ExpenseViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: Expense | null;
}

const ExpenseViewDialog: React.FC<ExpenseViewDialogProps> = ({
  open,
  onOpenChange,
  expense,
}) => {
  const { supabase, session } = useSession();
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(true);

  useEffect(() => {
    const fetchReceiptImage = async () => {
      if (!session || !expense?.receipt_id) {
        setReceiptImageUrl(null);
        setLoadingImage(false);
        return;
      }

      setLoadingImage(true);
      try {
        const { data, error } = await supabase
          .from('receipts')
          .select('image_url')
          .eq('id', expense.receipt_id)
          .single();

        if (error) {
          throw new Error(error.message);
        }

        setReceiptImageUrl(data?.image_url || null);
      } catch (error: any) {
        showError('Failed to fetch receipt image: ' + error.message);
        console.error('Error fetching receipt image:', error);
        setReceiptImageUrl(null);
      } finally {
        setLoadingImage(false);
      }
    };

    if (open && expense) {
      fetchReceiptImage();
    } else if (!open) {
      setReceiptImageUrl(null); // Clear image when dialog closes
    }
  }, [open, expense, session, supabase]);

  if (!expense) {
    return null; // Or render a placeholder if no expense is provided
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>Expense Details</DialogTitle>
          <DialogDescription>
            View the details of your expense and the associated receipt.
          </DialogDescription>
        </DialogHeader>
        <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
          <ResizablePanel defaultSize={50} minSize={30} className="p-6 overflow-y-auto">
            <div className="flex flex-col items-center justify-center h-full bg-secondary/20 rounded-lg p-4">
              {loadingImage ? (
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              ) : receiptImageUrl ? (
                <img src={receiptImageUrl} alt="Receipt" className="max-w-full max-h-full object-contain rounded-md shadow-md" />
              ) : (
                <p className="text-muted-foreground">No receipt image available.</p>
              )}
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={50} minSize={30} className="p-6 overflow-y-auto">
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right font-medium">Name:</Label>
                <span className="col-span-3">{expense.name}</span>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right font-medium">Category:</Label>
                <span className="col-span-3">{expense.category}</span>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right font-medium">Amount:</Label>
                  <span className="col-span-3">${expense.amount.toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right font-medium">Date:</Label>
                  <span className="col-span-3">{format(new Date(expense.date), 'PPP')}</span>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right font-medium">Merchant:</Label>
                  <span className="col-span-3">{expense.merchant || 'N/A'}</span>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right font-medium">VAT Code:</Label>
                  <span className="col-span-3">{expense.vat_code || 'N/A'}</span>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right font-medium">TVSH (%):</Label>
                  <span className="col-span-3">{expense.tvsh_percentage}%</span>
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </DialogContent>
    </Dialog>
  );
};

export default ExpenseViewDialog;
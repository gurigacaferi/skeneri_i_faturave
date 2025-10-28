import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save } from 'lucide-react';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { format } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePicker } from './DatePicker';

interface Expense {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: string;
  merchant: string | null;
  tvsh_percentage: number;
  vat_code: string | null;
  created_at: string;
  nui: string | null;
  nr_fiskal: string | null;
  numri_i_tvsh_se: string | null;
  description: string | null;
  sasia: number | null;
  njesia: string | null;
  receipt_id: string | null; // Added to check for receipt
  receipt_url?: string | null; // Added for the image URL
}

interface EditExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: Expense;
  onExpenseUpdated: () => void;
}

// --- Viewer.js Integration Hook (Copied from ReceiptReview for reuse) ---
const useViewerJs = (imageUrl: string | null | undefined, elementId: string) => {
  useEffect(() => {
    if (imageUrl) {
      // Dynamically import Viewer.js
      import('https://unpkg.com/viewerjs/dist/viewer.esm.js')
        .then(({ default: Viewer }) => {
          const imageElement = document.getElementById(elementId) as HTMLImageElement;
          if (imageElement) {
            // Ensure the image is loaded before initializing Viewer
            const initializeViewer = () => {
              // Destroy any existing viewer instance to prevent duplicates
              if ((imageElement as any).viewer) {
                (imageElement as any).viewer.destroy();
              }
              
              // Initialize the new viewer instance
              new Viewer(imageElement, {
                movable: true, zoomable: true, zoomOnWheel: true, zoomOnTouch: true,
                inline: true, // Use inline mode for the split screen
                navbar: false, // Hide navigation
                title: false, // Hide title
                toolbar: {
                  zoomIn: true,
                  zoomOut: true,
                  oneToOne: true,
                  reset: true,
                  prev: false,
                  play: false,
                  next: false,
                  rotateLeft: true,
                  rotateRight: true,
                  flipHorizontal: true,
                  flipVertical: true,
                },
              });
            };

            imageElement.onload = initializeViewer;
            // If the image is already loaded (e.g., cached), manually trigger initialization
            if (imageElement.complete) {
                initializeViewer();
            }
          }
        })
        .catch(err => console.error("Failed to load Viewer.js:", err));
    }
  }, [imageUrl, elementId]);
};
// -----------------------------------------------------------------------

const EditExpenseDialog: React.FC<EditExpenseDialogProps> = ({
  open,
  onOpenChange,
  expense: initialExpense,
  onExpenseUpdated,
}) => {
  const { supabase, session, categories, vatCodes, units } = useSession();
  const [formData, setFormData] = useState<Expense>(initialExpense);
  const [isSaving, setIsSaving] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  // Fetch receipt URL if receipt_id exists
  useEffect(() => {
    const fetchReceiptUrl = async () => {
      if (initialExpense.receipt_id) {
        const { data, error } = await supabase
          .from('receipts')
          .select('image_url')
          .eq('id', initialExpense.receipt_id)
          .single();

        if (error) {
          console.error("Error fetching receipt URL:", error);
          setReceiptUrl(null);
        } else {
          setReceiptUrl(data?.image_url || null);
        }
      } else {
        setReceiptUrl(null);
      }
    };

    if (open) {
      fetchReceiptUrl();
      setFormData(initialExpense);
    }
  }, [open, initialExpense, supabase]);

  // Initialize Viewer.js if a receipt URL is available
  useViewerJs(receiptUrl, 'edit-receipt-image');

  const handleInputChange = useCallback((field: keyof Expense, value: any) => {
    setFormData(prev => {
      const updatedData = { ...prev, [field]: value };

      // Auto-calculate tvsh_percentage if vat_code changes
      if (field === 'vat_code') {
        const vatCode = value as string;
        const match = vatCode.match(/(\d+)%/);
        updatedData.tvsh_percentage = match ? parseInt(match[1], 10) : 0;
      }

      return updatedData;
    });
  }, []);

  const handleSave = async () => {
    if (!session) return;
    setIsSaving(true);
    const toastId = showLoading('Updating expense...');

    try {
      const { id, created_at, receipt_id, receipt_url, ...updateData } = formData;

      const { error } = await supabase
        .from('expenses')
        .update({
          ...updateData,
          amount: parseFloat(updateData.amount as any),
          sasia: parseFloat(updateData.sasia as any) || 1,
        })
        .eq('id', id);

      if (error) throw new Error(error.message);

      showSuccess('Expense updated successfully!');
      onExpenseUpdated();
      onOpenChange(false);
    } catch (error: any) {
      showError('Failed to update expense: ' + error.message);
    } finally {
      dismissToast(toastId);
      setIsSaving(false);
    }
  };

  const hasReceipt = !!receiptUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className={hasReceipt ? "max-w-6xl h-[90vh] p-0" : "sm:max-w-[600px]"}
        // Prevent closing when saving
        onInteractOutside={(e) => { if (isSaving) e.preventDefault(); }}
      >
        <div className={hasReceipt ? "grid grid-cols-2 h-full" : "block"}>
          
          {/* LEFT SIDE: Image Viewer (Conditional) */}
          {hasReceipt && (
            <div className="relative h-full overflow-hidden rounded-l-lg border-r bg-secondary/50 p-4">
              <h2 className="text-lg font-semibold mb-2 text-center">Receipt Image (Zoom & Drag)</h2>
              <div className="h-[calc(100%-3rem)] flex items-center justify-center">
                <img 
                  id="edit-receipt-image" 
                  src={receiptUrl!} 
                  alt="Receipt for expense" 
                  className="max-w-full max-h-full object-contain cursor-move" 
                  style={{ display: 'block', width: '100%', height: '100%' }}
                />
              </div>
            </div>
          )}

          {/* RIGHT SIDE: Form */}
          <div className={`flex flex-col h-full ${hasReceipt ? 'col-span-1' : 'col-span-full'}`}>
            <DialogHeader className="p-6 pb-4 border-b">
              <DialogTitle>Edit Expense</DialogTitle>
              <DialogDescription>
                Make changes to your expense details here. Click save when you're done.
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex-grow overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Item Name</Label>
                  <Input
                    id="name"
                    value={formData.name || ''}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (€)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={formData.amount || ''}
                    onChange={(e) => handleInputChange('amount', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => handleInputChange('category', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vat_code">VAT Code</Label>
                  <Select
                    value={formData.vat_code || ''}
                    onValueChange={(value) => handleInputChange('vat_code', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select VAT Code" />
                    </SelectTrigger>
                    <SelectContent>
                      {vatCodes.map(code => (
                        <SelectItem key={code} value={code}>
                          {code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sasia">Sasia (Quantity)</Label>
                  <Input
                    id="sasia"
                    type="number"
                    step="0.01"
                    value={formData.sasia || 1}
                    onChange={(e) => handleInputChange('sasia', parseFloat(e.target.value) || 1)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="njesia">Njesia (Unit)</Label>
                  <Select
                    value={formData.njesia || ''}
                    onValueChange={(value) => handleInputChange('njesia', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map(unit => (
                        <SelectItem key={unit} value={unit}>
                          {unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <DatePicker
                    date={formData.date ? new Date(formData.date) : undefined}
                    onDateChange={(date) => handleInputChange('date', date ? format(date, 'yyyy-MM-dd') : '')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="merchant">Merchant</Label>
                  <Input
                    id="merchant"
                    value={formData.merchant || ''}
                    onChange={(e) => handleInputChange('merchant', e.target.value)}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description || ''}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                  />
                </div>
                {/* Hidden fields for NUI, Nr. Fiskal, etc. */}
                <div className="hidden">
                  <Input value={formData.nui || ''} onChange={(e) => handleInputChange('nui', e.target.value)} />
                  <Input value={formData.nr_fiskal || ''} onChange={(e) => handleInputChange('nr_fiskal', e.target.value)} />
                  <Input value={formData.numri_i_tvsh_se || ''} onChange={(e) => handleInputChange('numri_i_tvsh_se', e.target.value)} />
                </div>
              </div>
            </div>
            
            <DialogFooter className="p-6 pt-4 border-t">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Changes
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditExpenseDialog;
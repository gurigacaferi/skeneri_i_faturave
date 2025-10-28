import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useSession } from '@/components/SessionContextProvider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from '@radix-ui/react-icons';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import ReceiptViewer from './ReceiptViewer';
import { Textarea } from '@/components/ui/textarea';
import { NJESIA_OPTIONS, VAT_CODES, EXPENSE_CATEGORIES, ALL_SUBCATEGORIES, getPercentageFromVatCode } from '@/lib/constants';

interface Expense {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: string;
  merchant: string | null;
  tvsh_percentage: number;
  vat_code: string;
  nui: string | null;
  nr_fiskal: string | null;
  numri_i_tvsh_se: string | null;
  description: string | null;
  receipt_id: string | null;
  sasia: number | null;
  njesia: string | null;
}

interface EditExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: Expense;
  onExpenseUpdated: () => void;
}

const formSchema = z.object({
  name: z.string().min(1, 'Expense name is required'),
  category: z.string().refine(val => ALL_SUBCATEGORIES.includes(val), 'A valid sub-category is required'),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  date: z.date({ required_error: 'Date is required' }),
  merchant: z.string().nullable(),
  vat_code: z.string().refine(val => VAT_CODES.includes(val), 'A valid VAT code is required'),
  tvsh_percentage: z.coerce.number().min(0).max(100),
  nui: z.string().nullable(),
  nr_fiskal: z.string().nullable(),
  numri_i_tvsh_se: z.string().nullable(),
  description: z.string().nullable(),
  sasia: z.coerce.number().min(0.01, 'Quantity must be greater than 0').nullable(),
  njesia: z.string().refine(val => NJESIA_OPTIONS.includes(val), 'A valid unit is required').nullable(),
});

const EditExpenseDialog: React.FC<EditExpenseDialogProps> = ({
  open,
  onOpenChange,
  expense,
  onExpenseUpdated,
}) => {
  const { session, supabase } = useSession();
  const [loading, setLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: expense.name,
      category: expense.category,
      amount: expense.amount,
      date: new Date(expense.date),
      merchant: expense.merchant,
      vat_code: expense.vat_code || 'No VAT',
      tvsh_percentage: expense.tvsh_percentage,
      nui: expense.nui,
      nr_fiskal: expense.nr_fiskal,
      numri_i_tvsh_se: expense.numri_i_tvsh_se,
      description: expense.description,
      sasia: expense.sasia || 1,
      njesia: expense.njesia || NJESIA_OPTIONS[0],
    },
  });

  // Watch for changes in vat_code to update tvsh_percentage
  const watchedVatCode = form.watch('vat_code');
  useEffect(() => {
    const newPercentage = getPercentageFromVatCode(watchedVatCode);
    form.setValue('tvsh_percentage', newPercentage);
  }, [watchedVatCode, form]);

  useEffect(() => {
    if (open) {
      form.reset({
        name: expense.name,
        category: expense.category,
        amount: expense.amount,
        date: new Date(expense.date),
        merchant: expense.merchant,
        vat_code: expense.vat_code || 'No VAT',
        tvsh_percentage: expense.tvsh_percentage,
        nui: expense.nui,
        nr_fiskal: expense.nr_fiskal,
        numri_i_tvsh_se: expense.numri_i_tvsh_se,
        description: expense.description,
        sasia: expense.sasia || 1,
        njesia: expense.njesia || NJESIA_OPTIONS[0],
      });
    }
  }, [open, expense, form]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!session) {
      showError('You must be logged in to edit expenses.');
      return;
    }

    setLoading(true);
    const toastId = showLoading('Updating expense...');

    try {
      const { error } = await supabase
        .from('expenses')
        .update({
          name: values.name,
          category: values.category,
          amount: values.amount,
          date: format(values.date, 'yyyy-MM-dd'),
          merchant: values.merchant,
          vat_code: values.vat_code,
          tvsh_percentage: values.tvsh_percentage,
          nui: values.nui,
          nr_fiskal: values.nr_fiskal,
          numri_i_tvsh_se: values.numri_i_tvsh_se,
          description: values.description,
          sasia: values.sasia,
          njesia: values.njesia,
        })
        .eq('id', expense.id)
        .eq('user_id', session.user.id);

      if (error) {
        throw new Error(error.message);
      }

      showSuccess('Expense updated successfully!');
      onExpenseUpdated();
      onOpenChange(false);
    } catch (error: any) {
      showError('Failed to update expense: ' + error.message);
      console.error('Error updating expense:', error);
    } finally {
      dismissToast(toastId);
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1000px] max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>Edit Expense</DialogTitle>
          <DialogDescription>
            Make changes to your expense here. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 p-6 pt-4">
          {/* Left Column: Receipt Viewer (40% width) */}
          <aside className="lg:col-span-2">
            <ReceiptViewer receiptId={expense.receipt_id} />
          </aside>

          {/* Right Column: Form Data (60% width) */}
          <form onSubmit={form.handleSubmit(onSubmit)} className="lg:col-span-3 grid gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Row 1 */}
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" {...form.register('name')} disabled={loading} />
                {form.formState.errors.name && (
                  <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
                )}
              </div>

              {/* Row 2 */}
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  onValueChange={(value) => form.setValue('category', value)}
                  value={form.watch('category')}
                  disabled={loading}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EXPENSE_CATEGORIES).map(([mainCategory, subcategories]) => (
                      <SelectGroup key={mainCategory}>
                        <SelectLabel>{mainCategory}</SelectLabel>
                        {subcategories.map((subCategory) => (
                          <SelectItem key={subCategory} value={subCategory}>
                            {subCategory}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.category && (
                  <p className="text-sm text-red-500">{form.formState.errors.category.message}</p>
                )}
              </div>

              {/* Row 3: Amount & Date */}
              <div className="space-y-1">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  {...form.register('amount')}
                  disabled={loading}
                />
                {form.formState.errors.amount && (
                  <p className="text-sm text-red-500">{form.formState.errors.amount.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="date">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={'outline'}
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !form.watch('date') && 'text-muted-foreground'
                      )}
                      disabled={loading}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.watch('date') ? format(form.watch('date'), 'PPP') : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={form.watch('date')}
                      onSelect={(date) => form.setValue('date', date!)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                {form.formState.errors.date && (
                  <p className="text-sm text-red-500">{form.formState.errors.date.message}</p>
                )}
              </div>

              {/* Row 4: Sasia & Njesia */}
              <div className="space-y-1">
                <Label htmlFor="sasia">Sasia (Qty)</Label>
                <Input
                  id="sasia"
                  type="number"
                  step="1"
                  {...form.register('sasia', { valueAsNumber: true })}
                  disabled={loading}
                />
                {form.formState.errors.sasia && (
                  <p className="text-sm text-red-500">{form.formState.errors.sasia.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="njesia">Njesia (Unit)</Label>
                <Select
                  onValueChange={(value) => form.setValue('njesia', value)}
                  value={form.watch('njesia') || NJESIA_OPTIONS[0]}
                  disabled={loading}
                >
                  <SelectTrigger id="njesia">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {NJESIA_OPTIONS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.njesia && (
                  <p className="text-sm text-red-500">{form.formState.errors.njesia.message}</p>
                )}
              </div>

              {/* Row 5: Merchant & NUI */}
              <div className="space-y-1">
                <Label htmlFor="merchant">Merchant</Label>
                <Input id="merchant" {...form.register('merchant')} disabled={loading} />
                {form.formState.errors.merchant && (
                  <p className="text-sm text-red-500">{form.formState.errors.merchant.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="nui">NUI</Label>
                <Input id="nui" {...form.register('nui')} disabled={loading} />
                {form.formState.errors.nui && (
                  <p className="text-sm text-red-500">{form.formState.errors.nui.message}</p>
                )}
              </div>

              {/* Row 6: Nr. Fiskal & Numri i TVSH-se */}
              <div className="space-y-1">
                <Label htmlFor="nr_fiskal">Nr. Fiskal</Label>
                <Input id="nr_fiskal" {...form.register('nr_fiskal')} disabled={loading} />
                {form.formState.errors.nr_fiskal && (
                  <p className="text-sm text-red-500">{form.formState.errors.nr_fiskal.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="numri_i_tvsh_se">Numri i TVSH-se</Label>
                <Input id="numri_i_tvsh_se" {...form.register('numri_i_tvsh_se')} disabled={loading} />
                {form.formState.errors.numri_i_tvsh_se && (
                  <p className="text-sm text-red-500">{form.formState.errors.numri_i_tvsh_se.message}</p>
                )}
              </div>

              {/* Row 7: VAT Code & TVSH (%) */}
              <div className="space-y-1">
                <Label htmlFor="vat_code">VAT Code</Label>
                <Select
                  onValueChange={(value) => form.setValue('vat_code', value)}
                  value={form.watch('vat_code')}
                  disabled={loading}
                >
                  <SelectTrigger id="vat_code">
                    <SelectValue placeholder="Select VAT code" />
                  </SelectTrigger>
                  <SelectContent>
                    {VAT_CODES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.vat_code && (
                  <p className="text-sm text-red-500">{form.formState.errors.vat_code.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="tvsh_percentage">TVSH (%)</Label>
                <Input
                  id="tvsh_percentage"
                  type="number"
                  value={form.watch('tvsh_percentage')}
                  className="bg-muted/50 cursor-not-allowed"
                  readOnly
                  disabled
                />
              </div>

              {/* Row 8: Description (Span 2) */}
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  {...form.register('description')}
                  className="min-h-[80px]"
                  disabled={loading}
                />
                {form.formState.errors.description && (
                  <p className="text-sm text-red-500">{form.formState.errors.description.message}</p>
                )}
              </div>
            </div>

            <DialogFooter className="mt-4 sm:col-span-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save changes'
                )}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditExpenseDialog;
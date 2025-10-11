import React, { useEffect, useState } from 'react';
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
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from '@radix-ui/react-icons';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

interface Expense {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: string;
  merchant: string | null;
  tvsh_percentage: number;
  vat_code: string; // Added new vat_code field
}

interface EditExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: Expense;
  onExpenseUpdated: () => void;
}

const expenseCategories = {
  "660 Shpenzime te personelit": [
    "660-01 Paga bruto",
    "660-02 Sigurimi shendetesor",
    "660-03 Kontributi pensional",
  ],
  "665 Shpenzimet e zyres": [
    "665-01 Shpenzimet e qirase",
    "665-02 Material harxhues",
    "665-03 Pastrimi",
    "665-04 Ushqim dhe pije",
    "665-05 Shpenzime te IT-se",
    "665-06 Shpenzimt e perfaqesimit",
    "665-07 Asete nen 1000 euro",
    "665-09 Te tjera",
  ],
  "667 Sherbimet profesionale": [
    "667-01 Sherbimet e kontabilitetit",
    "667-02 Sherbime ligjore",
    "667-03 Sherbime konsulente",
    "667-04 Sherbime auditimi",
  ],
  "668 Shpenzimet e udhetimit": [
    "668-01 Akomodimi",
    "668-02 Meditja",
    "668-03 Transporti",
  ],
  "669 Shpenzimet e automjetit": [
    "669-01 Shpenzimet e karburantit",
    "669-02 Mirembajtje dhe riparim",
  ],
  "675 Shpenzimet e komunikimit": [
    "675-01 Interneti",
    "675-02 Telefon mobil",
    "675-03 Dergesa postare",
    "675-04 Telefon fiks",
  ],
  "683 Shpenzimet e sigurimit": [
    "683-01 Sigurimi i automjeteve",
    "683-02 Sigurimi i nderteses",
  ],
  "686 Komunalite": [
    "686-01 Energjia elektrike",
    "686-02 Ujesjellesi",
    "686-03 Pastrimi",
    "686-04 Shpenzimet e ngrohjes",
  ],
  "690 Shpenzime tjera operative": [
    "690-01 Shpenzimet e anetaresimit",
    "690-02 Shpenzimet e perkthimit",
    "690-03 Provizion bankar",
    "690-04 Mirembajtje e webfaqes",
    "690-05 Taksa komunale",
    "690-06 Mirembajtje e llogarise bankare",
  ],
};

const allSubcategories = Object.values(expenseCategories).flat();

// New VAT codes from user's request
const vatCodes = [
  "[31] Blerjet dhe importet pa TVSH",
  "[32] Blerjet dhe importet investive pa TVSH",
  "[33] Blerjet dhe importet me TVSH jo të zbritshme",
  "[34] Blerjet dhe importet investive me TVSH jo të zbritshme",
  "[35] Importet 18%",
  "[37] Importet 8%",
  "[39] Importet investive 18%",
  "[41] Importet investive 8%",
  "[43] Blerjet vendore 18%",
  "No VAT",
  "[45] Blerjet vendore 8%",
  "[47] Blerjet investive vendore 18%",
  "[49] Blerjet investive vendore 8%",
  "[65] E drejta e kreditimit të TVSH-së në lidhje me Ngarkesën e Kundërt 18%",
  "[28] Blerjet që i nënshtrohen ngarkesës së kundërt 18%",
];

// Helper to extract numeric percentage from the descriptive VAT code
const getPercentageFromVatCode = (vatCode: string): number => {
  if (vatCode === "No VAT" || vatCode.includes("pa TVSH") || vatCode.includes("jo të zbritshme")) {
    return 0;
  }
  const match = vatCode.match(/(\d+)%/);
  return match ? parseInt(match[1], 10) : 0;
};

const formSchema = z.object({
  name: z.string().min(1, 'Expense name is required'),
  category: z.string().refine(val => allSubcategories.includes(val), 'A valid sub-category is required'),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  date: z.date({ required_error: 'Date is required' }),
  merchant: z.string().nullable(),
  vat_code: z.string().refine(val => vatCodes.includes(val), 'A valid VAT code is required'), // Validate against new VAT codes
  tvsh_percentage: z.coerce.number().min(0).max(100), // Still keep for internal logic/DB, but derived
});

const EditExpenseDialog: React.FC<EditExpenseDialogProps> = ({
  open,
  onOpenChange,
  expense,
  onExpenseUpdated,
}) => {
  const { supabase, session } = useSession();
  const [loading, setLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: expense.name,
      category: expense.category,
      amount: expense.amount,
      date: new Date(expense.date),
      merchant: expense.merchant,
      vat_code: expense.vat_code || 'No VAT', // Set default or existing vat_code
      tvsh_percentage: expense.tvsh_percentage,
    },
  });

  // Watch for changes in vat_code to update tvsh_percentage
  const selectedVatCode = form.watch('vat_code');
  useEffect(() => {
    const newTvshPercentage = getPercentageFromVatCode(selectedVatCode);
    form.setValue('tvsh_percentage', newTvshPercentage);
  }, [selectedVatCode, form]);

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
          vat_code: values.vat_code, // Save the descriptive VAT code
          tvsh_percentage: values.tvsh_percentage, // Save the derived numeric percentage
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Expense</DialogTitle>
          <DialogDescription>
            Make changes to your expense here. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              {...form.register('name')}
              className="col-span-3"
              disabled={loading}
            />
            {form.formState.errors.name && (
              <p className="col-span-4 text-right text-sm text-red-500">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="category" className="text-right">
              Category
            </Label>
            <Select
              onValueChange={(value) => form.setValue('category', value)}
              value={form.watch('category')}
              disabled={loading}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(expenseCategories).map(([mainCategory, subcategories]) => (
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
              <p className="col-span-4 text-right text-sm text-red-500">{form.formState.errors.category.message}</p>
            )}
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="amount" className="text-right">
              Amount
            </Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              {...form.register('amount')}
              className="col-span-3"
              disabled={loading}
            />
            {form.formState.errors.amount && (
              <p className="col-span-4 text-right text-sm text-red-500">{form.formState.errors.amount.message}</p>
            )}
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="date" className="text-right">
              Date
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={'outline'}
                  className={cn(
                    'col-span-3 justify-start text-left font-normal',
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
              <p className="col-span-4 text-right text-sm text-red-500">{form.formState.errors.date.message}</p>
            )}
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="merchant" className="text-right">
              Merchant
            </Label>
            <Input
              id="merchant"
              {...form.register('merchant')}
              className="col-span-3"
              disabled={loading}
            />
            {form.formState.errors.merchant && (
              <p className="col-span-4 text-right text-sm text-red-500">{form.formState.errors.merchant.message}</p>
            )}
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="vat_code" className="text-right">
              VAT Code
            </Label>
            <Select
              onValueChange={(value) => form.setValue('vat_code', value)}
              value={form.watch('vat_code')}
              disabled={loading}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select VAT code" />
              </SelectTrigger>
              <SelectContent>
                {vatCodes.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.vat_code && (
              <p className="col-span-4 text-right text-sm text-red-500">{form.formState.errors.vat_code.message}</p>
            )}
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="tvsh_percentage" className="text-right">
              TVSH (%)
            </Label>
            <Input
              id="tvsh_percentage"
              type="number"
              value={form.watch('tvsh_percentage')}
              className="col-span-3"
              disabled // This field is now derived and read-only
            />
          </div>

          <DialogFooter>
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
      </DialogContent>
    </Dialog>
  );
};

export default EditExpenseDialog;
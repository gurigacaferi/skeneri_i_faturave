import React, { useState, useEffect } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ALL_EXPORT_COLUMN_KEYS, DEFAULT_EXPORT_COLUMNS } from '@/utils/exportToCsv';
import { showSuccess, showLoading, dismissToast, showError } from '@/utils/toast';
import { Loader2 } from 'lucide-react';

interface ExportSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettingsSaved: () => void;
}

// Map internal keys to display names
const DISPLAY_NAME_MAP: { [key: string]: string } = {
  date: 'Date',
  merchant: 'Supplier/Merchant',
  name: 'Item Name',
  category: 'Category (Account)',
  amount: 'Amount',
  vat_code: 'VAT Code',
  tvsh_percentage: 'TVSH (%)',
  nui: 'NUI (Numri Unik Identifikues)',
  nr_fiskal: 'Nr. Fiskal',
  numri_i_tvsh_se: 'Numri i TVSH-se',
  description: 'Description',
};

const ExportSettingsModal: React.FC<ExportSettingsModalProps> = ({
  open,
  onOpenChange,
  onSettingsSaved,
}) => {
  const { supabase, session, profile } = useSession();
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && profile?.csv_export_columns) {
      setSelectedColumns(profile.csv_export_columns);
    } else if (open) {
      // Use default if profile data is missing or modal just opened
      setSelectedColumns(DEFAULT_EXPORT_COLUMNS);
    }
  }, [open, profile]);

  const handleToggleColumn = (key: string, checked: boolean) => {
    setSelectedColumns(prev => {
      if (checked) {
        return Array.from(new Set([...prev, key]));
      } else {
        return prev.filter(col => col !== key);
      }
    });
  };

  const handleSave = async () => {
    if (!session) return;

    setLoading(true);
    const toastId = showLoading('Saving export preferences...');

    try {
      // Update the user's profile with the new column selection
      const { error } = await supabase
        .from('profiles')
        .update({ csv_export_columns: selectedColumns })
        .eq('id', session.user.id);

      if (error) throw new Error(error.message);

      showSuccess('Export preferences saved!');
      onSettingsSaved();
      onOpenChange(false);
    } catch (error: any) {
      showError('Failed to save preferences: ' + error.message);
      console.error('Error saving export preferences:', error);
    } finally {
      dismissToast(toastId);
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>CSV Export Settings</DialogTitle>
          <DialogDescription>
            Select the columns you want to include in your default CSV exports.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
          {ALL_EXPORT_COLUMN_KEYS.map((key) => (
            <div key={key} className="flex items-center space-x-2">
              <Checkbox
                id={key}
                checked={selectedColumns.includes(key)}
                onCheckedChange={(checked) => handleToggleColumn(key, checked as boolean)}
                disabled={loading}
              />
              <Label htmlFor={key} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                {DISPLAY_NAME_MAP[key] || key}
              </Label>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || selectedColumns.length === 0}>
            {loading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
            ) : (
              'Save Preferences'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportSettingsModal;
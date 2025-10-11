import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { showError } from '@/utils/toast';

interface ExpenseBatch {
  id: string;
  name: string;
  description: string | null;
  total_amount: number;
  status: string;
  created_at: string;
}

export const useDefaultBatch = () => {
  const { supabase, session } = useSession();
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [loadingBatches, setLoadingBatches] = useState(true);

  const fetchAndSetDefaultBatch = useCallback(async () => {
    if (!session) {
      setLoadingBatches(false);
      setSelectedBatchId(null);
      return;
    }

    setLoadingBatches(true);
    const { data: batches, error } = await supabase
      .from('expense_batches')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      showError('Failed to fetch expense batches: ' + error.message);
      console.error('Error fetching expense batches:', error);
      setSelectedBatchId(null);
    } else if (batches && batches.length > 0) {
      setSelectedBatchId(batches[0].id); // Select the most recent batch
    } else {
      // No batches found, create a default one
      const { data: newBatch, error: createError } = await supabase
        .from('expense_batches')
        .insert({
          user_id: session.user.id,
          name: 'Default Batch',
          description: 'Automatically created default batch',
        })
        .select()
        .single();

      if (createError) {
        showError('Failed to create default expense batch: ' + createError.message);
        console.error('Error creating default batch:', createError);
        setSelectedBatchId(null);
      } else if (newBatch) {
        setSelectedBatchId(newBatch.id);
      }
    }
    setLoadingBatches(false);
  }, [session, supabase]);

  useEffect(() => {
    fetchAndSetDefaultBatch();
  }, [fetchAndSetDefaultBatch]);

  return { selectedBatchId, loadingBatches, refreshBatches: fetchAndSetDefaultBatch };
};
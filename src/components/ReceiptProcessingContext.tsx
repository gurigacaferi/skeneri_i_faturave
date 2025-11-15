import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { showSuccess, showError } from '@/utils/toast';

// Define the structure for a pending job
interface PendingReceiptJob {
  receipt_id: string;
  filename: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0 to 100
  error_message: string | null;
}

interface ReceiptProcessingContextType {
  pendingJobs: PendingReceiptJob[];
  addJob: (job: Omit<PendingReceiptJob, 'status' | 'progress' | 'error_message'>) => void;
  updateJobStatus: (receiptId: string, status: 'processing' | 'completed' | 'failed', progress?: number, error_message?: string) => void;
  clearJob: (receiptId: string) => void;
}

const ReceiptProcessingContext = createContext<ReceiptProcessingContextType | undefined>(undefined);

export const useReceiptProcessing = () => {
  const context = useContext(ReceiptProcessingContext);
  if (context === undefined) {
    throw new Error('useReceiptProcessing must be used within a ReceiptProcessingProvider');
  }
  return context;
};

export const ReceiptProcessingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { supabase, session } = useSession();
  const [pendingJobs, setPendingJobs] = useState<PendingReceiptJob[]>([]);

  // Function to add a new job to the global state
  const addJob = useCallback((job: Omit<PendingReceiptJob, 'status' | 'progress' | 'error_message'>) => {
    setPendingJobs(prev => {
      if (prev.some(j => j.receipt_id === job.receipt_id)) return prev;
      return [
        ...prev,
        { ...job, status: 'pending', progress: 0, error_message: null }
      ];
    });
  }, []);

  // Function to update the status of an existing job
  const updateJobStatus = useCallback((
    receiptId: string, 
    status: 'processing' | 'completed' | 'failed', 
    progress: number = 0, 
    error_message: string | null = null
  ) => {
    setPendingJobs(prev => prev.map(job => 
      job.receipt_id === receiptId 
        ? { ...job, status, progress: progress || job.progress, error_message } 
        : job
    ));
  }, []);

  // Function to clear a job (e.g., after completion or user dismissal)
  const clearJob = useCallback((receiptId: string) => {
    setPendingJobs(prev => prev.filter(job => job.receipt_id !== receiptId));
  }, []);

  // Effect to set up the persistent Realtime subscription
  useEffect(() => {
    if (!supabase || !session) return;

    // 1. Fetch any existing pending jobs on mount (in case of page refresh)
    const fetchInitialJobs = async () => {
      const { data, error } = await supabase
        .from('receipts')
        .select('id, filename, processing_status')
        .eq('user_id', session.user.id)
        .in('processing_status', ['pending', 'processing']);
      
      if (error) {
        console.error('Error fetching initial pending receipts:', error);
        return;
      }

      const initialJobs: PendingReceiptJob[] = data.map(r => ({
        receipt_id: r.id,
        filename: r.filename || 'Unknown File',
        status: r.processing_status as 'pending' | 'processing',
        progress: r.processing_status === 'processing' ? 50 : 0,
        error_message: null,
      }));
      setPendingJobs(initialJobs);
    };

    fetchInitialJobs();

    // 2. Set up Realtime subscription for status changes
    const channel = supabase
      .channel('receipt_processing_status')
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'receipts',
          filter: `user_id=eq.${session.user.id}`
        },
        (payload) => {
          const newRecord = payload.new as { id: string, filename: string, processing_status: string, error_message: string | null };
          const receiptId = newRecord.id;
          const newStatus = newRecord.processing_status as 'pending' | 'processing' | 'completed' | 'failed';
          
          // Check if the job is currently being tracked or if it's a new job that just started processing
          const isTracked = pendingJobs.some(j => j.receipt_id === receiptId);

          if (newStatus === 'completed') {
            showSuccess(`Receipt "${newRecord.filename}" processed successfully!`);
            // The ExpensesList component will handle the refresh based on this context
            // We keep the job in state briefly to show the success message, then clear it.
            updateJobStatus(receiptId, 'completed', 100);
            setTimeout(() => clearJob(receiptId), 5000); // Clear after 5 seconds
          } else if (newStatus === 'failed') {
            showError(`Receipt "${newRecord.filename}" failed to process: ${newRecord.error_message || 'Unknown error'}`);
            updateJobStatus(receiptId, 'failed', 100, newRecord.error_message);
            setTimeout(() => clearJob(receiptId), 10000); // Clear after 10 seconds
          } else if (newStatus === 'processing' && !isTracked) {
             // This handles cases where the job was created on another device or during a refresh
             addJob({ receipt_id: receiptId, filename: newRecord.filename || 'Unknown File' });
             updateJobStatus(receiptId, 'processing', 50);
          } else if (newStatus === 'processing' && isTracked) {
             updateJobStatus(receiptId, 'processing', 50);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Supabase Realtime subscribed to receipt processing status.');
        }
      });

    // Cleanup function: Unsubscribe when the component unmounts (which should only happen on full app unmount)
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, session, addJob, updateJobStatus, clearJob]); // Dependencies ensure the effect runs only when necessary

  const value = {
    pendingJobs,
    addJob,
    updateJobStatus,
    clearJob,
  };

  return (
    <ReceiptProcessingContext.Provider value={value}>
      {children}
    </ReceiptProcessingContext.Provider>
  );
};
'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useReceiptReviewStore } from '@/store/receiptReviewStore';
import ExpenseReviewSplitScreen from '@/components/ExpenseReviewSplitScreen';
import { useSession } from '@/components/SessionContextProvider';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Loader2 } from 'lucide-react';

// Define the type for a single expense form state
interface ExpenseFormState {
    name: string;
    category: string;
    amount: number;
    date: string;
    merchant: string | null;
    vat_code: string | null;
    tvsh_percentage: number;
    nui: string | null;
    nr_fiskal: string | null;
    numri_i_tvsh_se: string | null;
    description: string | null;
    sasia: number | null;
    njesia: string | null;
}

const ReviewReceiptPage = () => {
    const navigate = useNavigate();
    const params = useParams();
    const { supabase, session } = useSession();
    const receiptIdParam = params.receiptId as string;

    const { receiptId, imageUrl, expenses, clearReviewData } = useReceiptReviewStore();
    
    // For this implementation, we will focus on the first expense from a receipt.
    const [expenseForm, setExpenseForm] = useState<ExpenseFormState | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        // If the store is empty (e.g., page refresh), redirect to dashboard.
        if (!receiptId || receiptId !== receiptIdParam || expenses.length === 0) {
            showError("No review data found. Please upload a receipt again.");
            navigate('/');
            return;
        }
        // Initialize form with the first expense
        setExpenseForm(expenses[0]);
    }, [receiptId, receiptIdParam, expenses, navigate]);

    const handleExpenseChange = (field: keyof ExpenseFormState, value: any) => {
        setExpenseForm(prev => prev ? { ...prev, [field]: value } : null);
    };

    const handleSave = async () => {
        if (!expenseForm || !session || !supabase) {
            showError("Session expired or data is missing.");
            return;
        }
        if (!receiptId) {
            showError("Receipt ID is missing.");
            return;
        }

        setIsSaving(true);
        const toastId = showLoading("Saving expense...");

        const expenseToSave = {
            ...expenseForm,
            user_id: session.user.id,
            receipt_id: receiptId,
        };

        try {
            const { error } = await supabase.from('expenses').insert([expenseToSave]);

            if (error) {
                throw error;
            }

            showSuccess("Expense saved successfully!");
            clearReviewData();
            navigate('/');

        } catch (error: any) {
            showError(`Failed to save expense: ${error.message}`);
        } finally {
            dismissToast(toastId);
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        clearReviewData();
        navigate('/');
    };

    if (!expenseForm) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-background">
                <div className="flex flex-col items-center space-y-2">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-lg text-muted-foreground">Loading Review Data...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 h-screen bg-secondary/30">
            <ExpenseReviewSplitScreen
                imageUrl={imageUrl}
                expenseData={expenseForm}
                onExpenseChange={handleExpenseChange}
                onSave={handleSave}
                onCancel={handleCancel}
                isSaving={isSaving}
                title="Review & Confirm Expense"
            />
        </div>
    );
};

export default ReviewReceiptPage;
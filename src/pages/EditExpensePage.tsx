import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '@/components/SessionContextProvider';
import ExpenseReviewSplitScreen from '@/components/ExpenseReviewSplitScreen';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Loader2 } from 'lucide-react';

interface ExpenseFormState {
    id: string;
    name: string;
    category: string;
    amount: number;
    date: string;
    merchant: string | null;
    vat_code: string | null;
    sasia: number | null;
    njesia: string | null;
}

const EditExpensePage = () => {
    const { expenseId } = useParams<{ expenseId: string }>();
    const navigate = useNavigate();
    const { supabase, session } = useSession();

    const [expenseForm, setExpenseForm] = useState<ExpenseFormState | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const fetchExpenseAndReceipt = useCallback(async () => {
        if (!expenseId || !supabase) return;

        setLoading(true);
        try {
            const { data: expenseData, error: expenseError } = await supabase
                .from('expenses')
                .select('*, receipts(storage_path)')
                .eq('id', expenseId)
                .single();

            if (expenseError) throw expenseError;
            if (!expenseData) throw new Error("Expense not found.");

            setExpenseForm({
                id: expenseData.id,
                name: expenseData.name,
                category: expenseData.category,
                amount: expenseData.amount,
                date: expenseData.date,
                merchant: expenseData.merchant,
                vat_code: expenseData.vat_code,
                sasia: expenseData.sasia,
                njesia: expenseData.njesia,
            });

            const receipt = Array.isArray(expenseData.receipts) ? expenseData.receipts[0] : expenseData.receipts;
            if (receipt && receipt.storage_path) {
                const { data: urlData } = supabase.storage
                    .from('receipts')
                    .getPublicUrl(receipt.storage_path);
                setImageUrl(urlData.publicUrl);
            } else {
                setImageUrl(null); 
            }

        } catch (error: any) {
            showError(`Failed to load expense: ${error.message}`);
            navigate('/');
        } finally {
            setLoading(false);
        }
    }, [expenseId, supabase, navigate]);

    useEffect(() => {
        fetchExpenseAndReceipt();
    }, [fetchExpenseAndReceipt]);

    const handleExpenseChange = (field: keyof ExpenseFormState, value: any) => {
        setExpenseForm(prev => prev ? { ...prev, [field]: value } : null);
    };

    const handleSave = async () => {
        if (!expenseForm || !session || !supabase) {
            showError("Session expired or data is missing.");
            return;
        }

        setIsSaving(true);
        const toastId = showLoading("Updating expense...");

        try {
            const { error } = await supabase
                .from('expenses')
                .update({
                    name: expenseForm.name,
                    category: expenseForm.category,
                    amount: expenseForm.amount,
                    date: expenseForm.date,
                    merchant: expenseForm.merchant,
                    vat_code: expenseForm.vat_code,
                    sasia: expenseForm.sasia,
                    njesia: expenseForm.njesia,
                })
                .eq('id', expenseForm.id);

            if (error) throw error;

            showSuccess("Expense updated successfully!");
            navigate('/');

        } catch (error: any) {
            showError(`Failed to update expense: ${error.message}`);
        } finally {
            dismissToast(toastId);
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        navigate('/');
    };

    if (loading) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-background">
                <div className="flex flex-col items-center space-y-2">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-lg text-muted-foreground">Loading Expense...</p>
                </div>
            </div>
        );
    }

    if (!expenseForm) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-background">
                <p className="text-lg text-destructive">Could not load expense data.</p>
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
                title="Edit Expense"
            />
        </div>
    );
};

export default EditExpensePage;
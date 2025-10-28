'use client';

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/components/SessionContextProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, UploadCloud } from 'lucide-react';
import { useReceiptReviewStore } from '@/store/receiptReviewStore';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';

// Mock function for AI parsing (to be replaced by a real API call later)
const mockParseReceipt = (imageUrl: string) => {
    console.log(`Mock parsing receipt at: ${imageUrl}`);
    // Mock data structure for a single expense
    return [
        {
            name: "Groceries",
            category: "Food",
            amount: 45.50,
            date: new Date().toISOString().split('T')[0],
            merchant: "Supermarket X",
            vat_code: "A",
            tvsh_percentage: 18,
            nui: "NUI123456789",
            nr_fiskal: "Fiskal123",
            numri_i_tvsh_se: "TVSH987654321",
            description: "Weekly shopping",
            sasia: 1,
            njesia: "Pcs",
        }
    ];
};

const UploadReceiptPage = () => {
    const navigate = useNavigate();
    const { supabase, session } = useSession();
    const { setReviewData } = useReceiptReviewStore();

    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            setFile(event.target.files[0]);
        }
    };

    const handleUpload = useCallback(async () => {
        if (!file || !session || !supabase) {
            showError("Please select a file and ensure you are logged in.");
            return;
        }

        setIsUploading(true);
        const toastId = showLoading("Uploading and processing receipt...");

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}.${fileExt}`;
            const filePath = `${session.user.id}/${fileName}`;

            // 1. Upload file to Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('receipts')
                .upload(filePath, file);

            if (uploadError) {
                throw uploadError;
            }

            // 2. Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('receipts')
                .getPublicUrl(filePath);

            if (!publicUrl) {
                throw new Error("Could not retrieve public URL for the uploaded file.");
            }

            // 3. Insert receipt record into the database
            const { data: receiptData, error: receiptError } = await supabase
                .from('receipts')
                .insert([{ user_id: session.user.id, image_url: publicUrl }]) // FIX: Changed public_url to image_url
                .select()
                .single();

            if (receiptError) {
                throw receiptError;
            }

            // 4. Mock AI parsing (Replace with actual API call later)
            const parsedExpenses = mockParseReceipt(publicUrl);

            // 5. Store data and navigate to review page
            setReviewData(receiptData.id, publicUrl, parsedExpenses);
            showSuccess("Receipt processed successfully!");
            navigate(`/review/${receiptData.id}`);

        } catch (error: any) {
            console.error('Upload error:', error);
            showError(`Upload failed: ${error.message}`);
        } finally {
            dismissToast(toastId);
            setIsUploading(false);
        }
    }, [file, session, supabase, navigate, setReviewData]);

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-background">
            <Card className="w-full max-w-md p-4">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl font-bold">Upload New Receipt</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-primary/50 rounded-lg bg-primary/5">
                        <UploadCloud className="w-10 h-10 text-primary mb-3" />
                        <p className="text-sm text-muted-foreground">
                            {file ? file.name : "Drag 'n' drop a receipt image here, or click to select"}
                        </p>
                        <Input
                            id="file-upload"
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                        <label htmlFor="file-upload" className="mt-4 cursor-pointer">
                            <Button variant="outline" size="sm">
                                Select File
                            </Button>
                        </label>
                    </div>

                    <Button
                        onClick={handleUpload}
                        disabled={!file || isUploading}
                        className="w-full"
                    >
                        {isUploading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            "Upload & Process"
                        )}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};

export default UploadReceiptPage;
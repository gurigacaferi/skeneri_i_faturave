'use client';

import React from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Assuming validSubcategories and validVatCodes are exported from a constants file
// For now, defining them here. In a real app, this would be shared.
const validSubcategories = [
    "660-01 Paga bruto", "660-02 Sigurimi shendetesor", "660-03 Kontributi pensional",
    "665-01 Shpenzimet e qirase", "665-02 Material harxhues", "665-03 Pastrimi", "665-04 Ushqim dhe pije",
    "665-05 Shpenzime te IT-se", "665-06 Shpenzimt e perfaqesimit", "665-07 Asete nen 1000 euro", "665-09 Te tjera",
    "667-01 Sherbimet profesionale", "667-02 Sherbime ligjore", "667-03 Sherbime konsulente", "667-04 Sherbime auditimi",
    "668-01 Akomodimi", "668-02 Meditja", "668-03 Transporti",
    "669-01 Shpenzimet e karburantit", "669-02 Mirembajtje dhe riparim",
    "675-01 Interneti", "675-02 Telefon mobil", "675-03 Dergesa postare", "675-04 Telefon fiks",
    "683-01 Sigurimi i automjeteve", "683-02 Sigurimi i nderteses",
    "686-01 Energjia elektrike", "686-02 Ujesjellesi", "686-03 Pastrimi", "686-04 Shpenzimet e ngrohjes",
    "690-01 Shpenzimet e anetaresimit", "690-02 Shpenzimet e perkthimit", "690-03 Provizion bankar",
    "690-04 Mirembajtje e webfaqes", "690-05 Taksa komunale", "690-06 Mirembajtje e llogarise bankare",
    "690-09 Te tjera",
];

const validVatCodes = [
    "[31] Blerjet dhe importet pa TVSH", "[32] Blerjet dhe importet investive pa TVSH",
    "[33] Blerjet dhe importet me TVSH jo të zbritshme", "[34] Blerjet dhe importet investive me TVSH jo të zbritshme",
    "[35] Importet 18%", "[37] Importet 8%", "[39] Importet investive 18%", "[41] Importet investive 8%",
    "[43] Blerjet vendore 18%", "No VAT", "[45] Blerjet vendore 8%", "[47] Blerjet investive vendore 18%",
    "[49] Blerjet investive vendore 8%", "[65] E drejta e kreditimit të TVSH-së në lidhje me Ngarkesën e Kundërt 18%",
    "[28] Blerjet që i nënshtrohen ngarkesës së kundërt 18%",
];


interface ExpenseFormData {
    id?: string;
    name: string;
    category: string;
    amount: number;
    date: string;
    merchant: string | null;
    vat_code: string | null;
    sasia: number | null;
    njesia: string | null;
    // Add other fields as necessary
}

interface ExpenseReviewSplitScreenProps {
    imageUrl: string | null;
    expenseData: ExpenseFormData;
    onExpenseChange: (field: keyof ExpenseFormData, value: any) => void;
    onSave: () => void;
    onCancel: () => void;
    isSaving?: boolean;
    title?: string;
}

const ExpenseReviewSplitScreen: React.FC<ExpenseReviewSplitScreenProps> = ({
    imageUrl,
    expenseData,
    onExpenseChange,
    onSave,
    onCancel,
    isSaving = false,
    title = "Review Expense"
}) => {
    if (!imageUrl) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p className="ml-2">Loading receipt image...</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full max-h-[calc(100vh-8rem)]">
            {/* Left Side: Image Viewer */}
            <Card className="flex flex-col h-full">
                <CardHeader>
                    <CardTitle>Receipt Image</CardTitle>
                </CardHeader>
                <CardContent className="flex-grow relative bg-secondary/20 rounded-b-lg overflow-hidden">
                    <TransformWrapper
                        initialScale={1}
                        centerZoomedOut={true}
                        limitToBounds={true}
                    >
                        {({ zoomIn, zoomOut, resetTransform }) => (
                            <>
                                <div className="absolute top-2 right-2 z-10 flex gap-1">
                                    <Button size="icon" variant="outline" onClick={() => zoomIn()} title="Zoom In"><ZoomIn className="h-4 w-4" /></Button>
                                    <Button size="icon" variant="outline" onClick={() => zoomOut()} title="Zoom Out"><ZoomOut className="h-4 w-4" /></Button>
                                    <Button size="icon" variant="outline" onClick={() => resetTransform()} title="Reset View"><RotateCw className="h-4 w-4" /></Button>
                                </div>
                                <TransformComponent
                                    wrapperStyle={{ width: '100%', height: '100%' }}
                                    contentStyle={{ width: '100%', height: '100%' }}
                                >
                                    <img src={imageUrl} alt="Receipt" className="object-contain w-full h-full" />
                                </TransformComponent>
                            </>
                        )}
                    </TransformWrapper>
                </CardContent>
            </Card>

            {/* Right Side: Expense Form */}
            <Card className="flex flex-col h-full">
                <CardHeader>
                    <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent className="flex-grow overflow-y-auto space-y-4">
                    <div>
                        <Label htmlFor="name">Item Name</Label>
                        <Input id="name" value={expenseData.name} onChange={(e) => onExpenseChange('name', e.target.value)} />
                    </div>
                    <div>
                        <Label htmlFor="category">Category</Label>
                        <Select value={expenseData.category} onValueChange={(value) => onExpenseChange('category', value)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                            <SelectContent>
                                {validSubcategories.map(cat => (
                                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label htmlFor="amount">Amount</Label>
                        <Input id="amount" type="number" value={expenseData.amount} onChange={(e) => onExpenseChange('amount', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div>
                        <Label htmlFor="date">Date</Label>
                        <Input id="date" type="date" value={expenseData.date} onChange={(e) => onExpenseChange('date', e.target.value)} />
                    </div>
                    <div>
                        <Label htmlFor="merchant">Merchant</Label>
                        <Input id="merchant" value={expenseData.merchant || ''} onChange={(e) => onExpenseChange('merchant', e.target.value)} />
                    </div>
                     <div>
                        <Label htmlFor="sasia">Quantity (Sasia)</Label>
                        <Input id="sasia" type="number" value={expenseData.sasia || 1} onChange={(e) => onExpenseChange('sasia', parseFloat(e.target.value) || 1)} />
                    </div>
                     <div>
                        <Label htmlFor="njesia">Unit (Njesia)</Label>
                        <Input id="njesia" value={expenseData.njesia || 'cope'} onChange={(e) => onExpenseChange('njesia', e.target.value)} />
                    </div>
                    <div>
                        <Label htmlFor="vat_code">VAT Code</Label>
                         <Select value={expenseData.vat_code || 'No VAT'} onValueChange={(value) => onExpenseChange('vat_code', value)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a VAT code" />
                            </SelectTrigger>
                            <SelectContent>
                                {validVatCodes.map(code => (
                                    <SelectItem key={code} value={code}>{code}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
                <div className="p-6 bg-secondary/20 rounded-b-lg flex justify-end gap-4">
                    <Button variant="outline" onClick={onCancel} disabled={isSaving}>Cancel</Button>
                    <Button onClick={onSave} disabled={isSaving}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Save Expense
                    </Button>
                </div>
            </Card>
        </div>
    );
};

export default ExpenseReviewSplitScreen;
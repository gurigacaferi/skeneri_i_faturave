import ReceiptDetails from "@/components/shared/ReceiptDetails";
import ReceiptViewer from "@/components/shared/ReceiptViewer";
import { Button } from "@/components/ui/button";

const receiptUrl = "/receipt.jpeg";

export default function ReceiptReviewScreen() {
  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="flex items-center justify-between p-4 border-b">
        <h1 className="text-2xl font-bold">Review Receipt</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline">Reject</Button>
          <Button>Approve</Button>
        </div>
      </header>
      <main className="flex-1 flex overflow-hidden">
        {/* Main content area for the receipt viewer */}
        <div className="flex-1 overflow-auto p-6">
          <ReceiptViewer receiptUrl={receiptUrl} />
        </div>
        {/* Sidebar for receipt details */}
        <aside className="w-1/3 border-l p-6 overflow-auto">
          <ReceiptDetails />
        </aside>
      </main>
    </div>
  );
}
type ReceiptViewerProps = {
  receiptUrl: string;
};

export default function ReceiptViewer({ receiptUrl }: ReceiptViewerProps) {
  return (
    <div className="w-full h-full flex items-center justify-center overflow-hidden bg-muted rounded-lg">
      <img
        src={receiptUrl}
        alt="Receipt"
        className="max-w-full max-h-full object-contain"
      />
    </div>
  );
}
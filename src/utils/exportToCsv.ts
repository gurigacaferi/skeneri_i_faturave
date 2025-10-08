import { format, addDays } from 'date-fns';

interface Expense {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: string;
  merchant: string | null;
  tvsh_percentage: number;
  vat_code: string | null; // Allow vat_code to be null
  created_at: string;
}

export const exportExpensesToCsv = (expenses: Expense[], batchName: string) => {
  if (!expenses || expenses.length === 0) {
    console.warn('No expenses to export.');
    return;
  }

  const headers = [
    'Supplier',
    'Bill Date',
    'Due Date',
    'Bill No',
    'Account', // This should be the expense category
    'Line Description',
    'Line Amount',
    'Line Tax Code', // This should be the exact VAT code string
  ];

  const csvRows = [headers.map(h => `"${h}"`).join(',')]; // Quote headers too

  expenses.forEach((expense) => {
    const billDate = new Date(expense.date);
    const formattedBillDate = format(billDate, 'yyyy-MM-dd');
    const dueDate = addDays(billDate, 30); // Assume Net 30 if no specific due date is available
    const formattedDueDate = format(dueDate, 'yyyy-MM-dd');
    const billNo = `${batchName.replace(/\s/g, '_')}-${expense.id.substring(0, 8)}`; // Generate a unique bill number
    
    // Use the actual VAT code from the expense, default to "No VAT" only if null/undefined/empty
    const vatCodeToExport = expense.vat_code || 'No VAT';

    const row = [
      `"${(expense.merchant || '').replace(/"/g, '""')}"`, // Supplier
      `"${formattedBillDate}"`, // Bill Date
      `"${formattedDueDate}"`, // Due Date (Net 30)
      `"${billNo.replace(/"/g, '""')}"`, // Bill No
      `"${(expense.category || '').replace(/"/g, '""')}"`, // Account (expense category)
      `"${expense.name.replace(/"/g, '""')}"`, // Line Description
      expense.amount.toFixed(2), // Line Amount (no quotes for numbers unless they contain commas)
      `"${vatCodeToExport.replace(/"/g, '""')}"`, // Line Tax Code (use actual VAT code from expense)
    ];
    csvRows.push(row.join(','));
  });

  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', `${batchName.replace(/\s/g, '_')}_quickbooks_bills.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
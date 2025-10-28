import { format, addDays } from 'date-fns';

interface Expense {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: string;
  merchant: string | null;
  tvsh_percentage: number;
  vat_code: string | null;
  created_at: string;
  nui: string | null;
  nr_fiskal: string | null;
  numri_i_tvsh_se: string | null;
  description: string | null;
  sasia: number | null; // NEW FIELD
  njesia: string | null; // NEW FIELD
}

// Map of internal expense keys to user-friendly CSV headers
const COLUMN_MAP: { [key: string]: { header: string; accessor: (expense: Expense) => string | number | null } } = {
  date: { header: 'Bill Date', accessor: (e) => format(new Date(e.date), 'yyyy-MM-dd') },
  merchant: { header: 'Supplier', accessor: (e) => e.merchant },
  name: { header: 'Line Description', accessor: (e) => e.name },
  category: { header: 'Account', accessor: (e) => e.category },
  amount: { header: 'Line Amount', accessor: (e) => e.amount.toFixed(2) },
  vat_code: { header: 'Line Tax Code', accessor: (e) => e.vat_code },
  tvsh_percentage: { header: 'TVSH (%)', accessor: (e) => e.tvsh_percentage },
  nui: { header: 'NUI', accessor: (e) => e.nui },
  nr_fiskal: { header: 'Nr. Fiskal', accessor: (e) => e.nr_fiskal },
  numri_i_tvsh_se: { header: 'Numri i TVSH-se', accessor: (e) => e.numri_i_tvsh_se },
  description: { header: 'Description', accessor: (e) => e.description },
  sasia: { header: 'Sasia', accessor: (e) => e.sasia }, // NEW FIELD
  njesia: { header: 'Njesia', accessor: (e) => e.njesia }, // NEW FIELD
  // Hardcoded fields for accounting systems (like QuickBooks) that need specific columns
  dueDate: { header: 'Due Date', accessor: (e) => format(addDays(new Date(e.date), 30), 'yyyy-MM-dd') },
  billNo: { header: 'Bill No', accessor: (e) => `EXP-${e.id.substring(0, 8)}` },
};

// Default columns for a standard export if no preference is provided
export const DEFAULT_EXPORT_COLUMNS = [
  'date', 'merchant', 'name', 'category', 'amount', 'vat_code', 'sasia', 'njesia',
];

// Columns required by external systems (like QuickBooks) that must be included regardless of user preference
const ACCOUNTING_SYSTEM_COLUMNS = ['dueDate', 'billNo'];

export const exportExpensesToCsv = (expenses: Expense[], fileName: string, selectedColumns: string[] = DEFAULT_EXPORT_COLUMNS) => {
  if (!expenses || expenses.length === 0) {
    console.warn('No expenses to export.');
    return;
  }

  // Combine user-selected columns with required accounting columns
  const finalColumns = Array.from(new Set([...selectedColumns, ...ACCOUNTING_SYSTEM_COLUMNS]));

  // Filter the column map based on the final list
  const columnsToExport = finalColumns
    .map(key => COLUMN_MAP[key])
    .filter(Boolean);

  if (columnsToExport.length === 0) {
    console.error('No valid columns selected for export.');
    return;
  }

  const headers = columnsToExport.map(col => `"${col.header}"`).join(',');
  const csvRows = [headers];

  expenses.forEach((expense) => {
    const row = columnsToExport.map(col => {
      const value = col.accessor(expense);
      
      // Handle null/undefined values
      if (value === null || value === undefined) {
        return '""';
      }
      
      // Ensure string values are quoted and escaped
      if (typeof value === 'string') {
        return `"${value.replace(/"/g, '""')}"`;
      }
      
      // Numbers are returned as is (e.g., amount.toFixed(2))
      return value;
    });
    csvRows.push(row.join(','));
  });

  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', `${fileName}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Export the full list of available keys for the settings modal
export const ALL_EXPORT_COLUMN_KEYS = Object.keys(COLUMN_MAP).filter(key => !ACCOUNTING_SYSTEM_COLUMNS.includes(key));
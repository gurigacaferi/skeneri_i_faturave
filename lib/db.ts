import { sql } from '@vercel/postgres';
import { Receipt, Expense } from './types';
import { unstable_noStore as noStore } from 'next/cache';

export async function getReceiptsForUser(userId: string): Promise<Receipt[]> {
  noStore();
  try {
    const { rows } = await sql`
      SELECT id, user_id, filename, storage_path, status, error_message, created_at, processed_at
      FROM receipts
      WHERE user_id = ${userId}
      ORDER BY created_at DESC;
    `;
    return rows as Receipt[];
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch receipts.');
  }
}

export async function getReceiptById(receiptId: string): Promise<Receipt | null> {
    noStore();
    try {
        const { rows } = await sql`
            SELECT id, user_id, filename, storage_path, status, error_message, created_at, processed_at
            FROM receipts
            WHERE id = ${receiptId};
        `;
        if (rows.length === 0) {
            return null;
        }
        return rows[0] as Receipt;
    } catch (error) {
        console.error('Database Error:', error);
        throw new Error('Failed to fetch receipt.');
    }
}

export async function getExpensesForReceipt(receiptId: string): Promise<Expense[]> {
  noStore();
  try {
    const { rows } = await sql`
      SELECT id, receipt_id, user_id, description, amount, category, page_number
      FROM expenses
      WHERE receipt_id = ${receiptId}
      ORDER BY page_number, id;
    `;
    return rows as Expense[];
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch expenses.');
  }
}
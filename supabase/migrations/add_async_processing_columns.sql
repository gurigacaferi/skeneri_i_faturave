-- Add columns to support async processing
ALTER TABLE receipts 
ADD COLUMN IF NOT EXISTS processed_data JSONB,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add index for faster status queries
CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts(status);
CREATE INDEX IF NOT EXISTS idx_receipts_user_status ON receipts(user_id, status);

-- Add columns to support async processing
ALTER TABLE receipts 
ADD COLUMN IF NOT EXISTS processed_data JSONB,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add indexes for faster status queries
CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts(status);
CREATE INDEX IF NOT EXISTS idx_receipts_user_status ON receipts(user_id, status);

-- Add comment for documentation
COMMENT ON COLUMN receipts.processed_data IS 'Stores the AI-extracted expense data for background processing';
COMMENT ON COLUMN receipts.error_message IS 'Stores error messages if processing fails';

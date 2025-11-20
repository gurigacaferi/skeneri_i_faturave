# Background Receipt Processing Fix

## Problem
Receipt processing was stopping when users switched tabs or apps because the browser throttles/pauses HTTP requests for background tabs.

## Solution
Implemented asynchronous background processing using:
1. **Trigger Function**: Initiates processing and returns immediately
2. **Async Processing Function**: Processes receipts independently in the background
3. **Polling Mechanism**: Checks for completion without blocking the browser
4. **Database Storage**: Stores processed results for retrieval

## Architecture

```
Client Upload → Storage Upload → Create Receipt Record → Trigger Processing
                                                              ↓
                                                    (Returns immediately)
                                                              ↓
                                          Background: Download → Process → Store Results
                                                              ↓
Client Polls Status ← Database Updates ← Processing Complete
```

## Files Changed

1. **Supabase Functions**:
   - `trigger-receipt-processing/index.ts` - New trigger endpoint
   - `async-receipt-processing/index.ts` - New background processor

2. **Frontend**:
   - `src/components/ReceiptUpload.tsx` - Updated to use async pattern with polling

3. **Database**:
   - `supabase/migrations/add_async_processing_columns.sql` - Added columns for processed data

## Deployment Steps

### 1. Apply Database Migration
```powershell
# Run the migration
supabase db push

# Or if using hosted Supabase, run in SQL editor:
# Copy contents of supabase/migrations/add_async_processing_columns.sql
```

### 2. Deploy Supabase Functions
```powershell
# Deploy the new functions
supabase functions deploy trigger-receipt-processing
supabase functions deploy process-receipt-async

# Verify deployment
supabase functions list
```

### 3. Deploy Frontend to Vercel
```powershell
# Commit changes
git add .
git commit -m "Fix: Enable background receipt processing"
git push origin main

# Vercel will auto-deploy
```

## Testing

### Test 1: Basic Functionality
1. Upload a receipt
2. Verify it starts processing
3. Check that you see "Processing continues in background" message
4. Wait for completion - should show success

### Test 2: Background Processing (Critical)
1. Upload a receipt
2. **Immediately switch to another tab/app** while processing
3. Wait 30 seconds
4. Switch back to the app
5. **Expected**: Receipt should be processed successfully

### Test 3: Multiple Files
1. Upload 3-5 receipts at once
2. Switch tabs while processing
3. Come back after 1-2 minutes
4. **Expected**: All receipts processed

### Test 4: Error Handling
1. Upload an invalid file (corrupt image)
2. Switch tabs during processing
3. **Expected**: Should show failed status with error message

## How It Works

### Before (Synchronous)
```
Upload → Process (takes 20-30s) → Return results
         ↑ BLOCKED if tab backgrounded
```

### After (Asynchronous)
```
Upload → Trigger (returns in <1s)
              ↓
         Background Processing (20-30s)
              ↓
Poll Status every 2s → Get results when ready
↑ Works even if tab is backgrounded
```

## Key Features

1. **Non-blocking**: Upload completes quickly, processing happens in background
2. **Tab-switching safe**: Processing continues regardless of browser tab state
3. **Progress tracking**: Users see progress updates via polling
4. **Error handling**: Failed receipts are marked and can be retried
5. **User feedback**: Clear message that background processing is enabled

## Monitoring

Check logs in Supabase Dashboard:
1. Go to Edge Functions → Logs
2. Filter by `trigger-receipt-processing` or `process-receipt-async`
3. Look for processing status and any errors

## Rollback Plan

If issues occur:
1. Revert to previous version of `ReceiptUpload.tsx`
2. Users will fall back to synchronous processing
3. Database columns are non-breaking additions

## Performance Notes

- Polling interval: 2 seconds
- Max polling attempts: 60 (2 minutes total)
- Processing typically completes in 20-30 seconds
- Each receipt processes independently

## Future Improvements

1. Add WebSocket for real-time updates (remove polling)
2. Implement queue system for better scaling
3. Add retry mechanism for failed processing
4. Store base64 images temporarily to avoid re-reading files

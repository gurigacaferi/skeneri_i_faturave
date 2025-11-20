# Deploy Background Processing - Manual Steps

Since the Supabase CLI installation failed, follow these steps to deploy manually through the Supabase Dashboard:

## Step 1: Apply Database Migration

1. Go to your Supabase Dashboard: https://app.supabase.com
2. Select your project
3. Go to **SQL Editor** (left sidebar)
4. Click **New Query**
5. Copy and paste the contents of `supabase/migrations/20241120000000_add_async_processing.sql`
6. Click **Run** to execute the migration

## Step 2: Deploy Edge Functions

### Deploy trigger-receipt-processing:

1. In Supabase Dashboard, go to **Edge Functions** (left sidebar)
2. Click **Create a new function**
3. Name it: `trigger-receipt-processing`
4. Copy the entire contents of `supabase/functions/trigger-receipt-processing/index.ts`
5. Paste it into the function editor
6. Click **Deploy function**

### Deploy process-receipt-async:

1. Click **Create a new function** again
2. Name it: `process-receipt-async`
3. Copy the entire contents of `supabase/functions/process-receipt-async/index.ts`
4. Paste it into the function editor
5. Click **Deploy function**

## Step 3: Verify Environment Variables

Make sure these environment variables are set in your Supabase project:

1. Go to **Project Settings** → **Edge Functions**
2. Ensure these secrets are set:
   - `OPENAI_API_KEY` - Your OpenAI API key
   - `SUPABASE_URL` - Auto-set by Supabase
   - `SUPABASE_SERVICE_ROLE_KEY` - Auto-set by Supabase
   - `SUPABASE_ANON_KEY` - Auto-set by Supabase

## Step 4: Deploy Frontend

```powershell
git add .
git commit -m "Add background receipt processing"
git push origin main
```

Vercel will automatically deploy your frontend changes.

## Step 5: Test It!

1. Go to test.fatur.al
2. Upload a receipt
3. **Immediately switch to another tab or app**
4. Wait 30 seconds
5. Switch back
6. Receipt should be processed! ✅

## How It Works

**Before (Broken):**
```
Browser → Process in JavaScript → Switch Tab → ❌ Stops
```

**After (Fixed):**
```
Browser → Upload File → Create DB Record
              ↓
Trigger Edge Function (returns immediately)
              ↓
Server Processes Receipt (continues independently)
              ↓
Browser Polls Status Every 2 Seconds
              ↓
✅ Completes even if tab is switched!
```

## Troubleshooting

### If you get "Failed to send a request to the Edge Function":

1. Check that both edge functions are deployed in Supabase Dashboard
2. Verify function names match exactly: `trigger-receipt-processing` and `process-receipt-async`
3. Check Edge Function logs in Supabase Dashboard for errors

### If processing still stops when switching tabs:

1. Verify the database migration was applied (check if `processed_data` column exists)
2. Check that `OPENAI_API_KEY` is set in Edge Function environment variables
3. Look at Edge Function logs for any errors

### Check Logs:

- Supabase Dashboard → Edge Functions → Select function → Logs tab
- Look for errors or success messages like "[receipt-id] Successfully processed"

## Alternative: Use Supabase CLI via npx

If you want to try the CLI again:

```powershell
# Use npx to run Supabase CLI without installing
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy trigger-receipt-processing
npx supabase functions deploy process-receipt-async
npx supabase db push
```

Get your `PROJECT_REF` from: https://app.supabase.com/project/_/settings/general

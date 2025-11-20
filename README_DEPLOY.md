# 🚀 Background Processing Setup - Quick Guide

## ✅ What I Did

I've implemented **server-side background processing** so receipts continue processing even when you switch tabs!

### Files Created:
1. **`trigger-receipt-processing`** - Triggers processing and returns immediately
2. **`process-receipt-async`** - Processes receipts on Supabase's servers
3. **Database migration** - Adds columns to store processed data
4. **Updated frontend** - Polls for completion instead of waiting

### How It Works Now:
```
Upload → Store File → Trigger Server Processing → Return Immediately
                              ↓
              (Processing happens on Supabase servers)
                              ↓
Frontend polls every 2 seconds → Gets result when ready
```

**Result: You can switch tabs/apps and receipts keep processing!** ✅

---

## 📝 What YOU Need To Do

### Step 1: Deploy Edge Functions to Supabase

Go to: https://app.supabase.com/project/_/functions

#### Create Function #1: `trigger-receipt-processing`
1. Click **"Create a new function"**
2. Name: `trigger-receipt-processing`
3. Copy ALL the code from: `supabase/functions/trigger-receipt-processing/index.ts`
4. Paste into the editor
5. Click **"Deploy function"**

#### Create Function #2: `process-receipt-async`
1. Click **"Create a new function"** again
2. Name: `process-receipt-async`
3. Copy ALL the code from: `supabase/functions/process-receipt-async/index.ts`
4. Paste into the editor
5. Click **"Deploy function"**

### Step 2: Apply Database Migration

Go to: https://app.supabase.com/project/_/sql

1. Click **"New Query"**
2. Copy ALL the code from: `supabase/migrations/20241120000000_add_async_processing.sql`
3. Paste into the SQL editor
4. Click **"Run"**

### Step 3: Done! Frontend Auto-Deployed

Vercel already auto-deployed your frontend (it happened when we pushed to GitHub).

---

## 🧪 Test It

1. Go to **test.fatur.al**
2. Upload a receipt
3. **Immediately switch to another tab** (Gmail, YouTube, whatever)
4. Wait 30 seconds
5. Switch back to test.fatur.al
6. **Receipt should be processed!** ✅

You'll see "✓ Processing runs on server - safe to switch tabs!" message.

---

## 🔍 Troubleshooting

### If you get "Failed to send a request to the Edge Function":

**Most likely cause:** Edge functions aren't deployed yet.

**Fix:**
1. Go to https://app.supabase.com/project/_/functions
2. Verify both functions exist and are **green (active)**:
   - `trigger-receipt-processing`
   - `process-receipt-async`
3. If they're missing, follow Step 1 above

### Check if it's working:

1. Go to https://app.supabase.com/project/_/functions
2. Click on `process-receipt-async`
3. Go to **"Logs"** tab
4. Upload a receipt on test.fatur.al
5. You should see logs like: `[receipt-id] Processing receipt from...`

---

## 📊 What Changed

### Before (Broken):
- Upload receipt
- Browser processes it in JavaScript
- Switch tab → **JavaScript pauses** → Processing stops ❌

### After (Fixed):
- Upload receipt
- File stored in Supabase Storage
- **Server processes it** (independent of browser)
- Frontend just checks "is it done yet?" every 2 seconds
- Switch tab → **Server keeps processing** → Works! ✅

---

## 💡 Key Benefits

✅ **Tab-switching safe** - Process continues when you switch tabs  
✅ **App-switching safe** - Process continues when you open other apps  
✅ **Minimize-safe** - Process continues when browser is minimized  
✅ **Refresh-safe** - If you refresh, can check status from dashboard  
✅ **No extra cost** - Uses your existing Supabase infrastructure  

---

## 🆘 Need Help?

1. **Check function deployment**: https://app.supabase.com/project/_/functions
2. **Check logs**: Click function → Logs tab
3. **Check database**: Verify `processed_data` column exists in `receipts` table

The functions run on **Supabase's servers** (Deno Deploy), not your computer, so they work 24/7!

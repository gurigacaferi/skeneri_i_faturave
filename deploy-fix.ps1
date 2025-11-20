# Deploy Background Processing Fix
# Run this script to deploy all changes

Write-Host "🚀 Deploying Background Processing Fix..." -ForegroundColor Cyan

# Step 1: Apply database migration
Write-Host "`n📊 Step 1: Applying database migration..." -ForegroundColor Yellow
supabase db push
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Database migration failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Database migration applied" -ForegroundColor Green

# Step 2: Deploy Supabase functions
Write-Host "`n⚡ Step 2: Deploying Supabase functions..." -ForegroundColor Yellow
supabase functions deploy trigger-receipt-processing
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to deploy trigger-receipt-processing" -ForegroundColor Red
    exit 1
}
Write-Host "✅ trigger-receipt-processing deployed" -ForegroundColor Green

supabase functions deploy process-receipt-async
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to deploy process-receipt-async" -ForegroundColor Red
    exit 1
}
Write-Host "✅ process-receipt-async deployed" -ForegroundColor Green

# Step 3: Deploy frontend
Write-Host "`n🌐 Step 3: Deploying frontend to Vercel..." -ForegroundColor Yellow
git add .
git commit -m "Fix: Enable background receipt processing to work when tab is switched"
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Git push failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Frontend pushed to git (Vercel will auto-deploy)" -ForegroundColor Green

Write-Host "`n✨ Deployment complete!" -ForegroundColor Green
Write-Host "`n📝 Testing Instructions:" -ForegroundColor Cyan
Write-Host "1. Go to test.fatur.al" -ForegroundColor White
Write-Host "2. Upload a receipt" -ForegroundColor White
Write-Host "3. Immediately switch to another tab/app" -ForegroundColor White
Write-Host "4. Wait 30 seconds" -ForegroundColor White
Write-Host "5. Return to the app - receipt should be processed!" -ForegroundColor White
Write-Host "`nSee BACKGROUND_PROCESSING_FIX.md for more details" -ForegroundColor Gray

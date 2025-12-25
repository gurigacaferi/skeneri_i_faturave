export default async function handler(req: any, res: any) {
  return res.status(200).json({
    hasQstashToken: !!process.env.QSTASH_TOKEN,
    hasSupabaseUrl: !!process.env.VITE_SUPABASE_URL || !!process.env.NEXT_PUBLIC_SUPABASE_URL || !!process.env.SUPABASE_URL,
    hasSupabaseKey: !!process.env.VITE_SUPABASE_ANON_KEY || !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !!process.env.SUPABASE_ANON_KEY,
    vercelUrl: process.env.VERCEL_URL,
    envVars: Object.keys(process.env).filter(k => k.includes('SUPABASE') || k.includes('QSTASH')),
  });
}

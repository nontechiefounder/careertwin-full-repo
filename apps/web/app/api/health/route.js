import { NextResponse } from 'next/server';

export async function GET() {
  const isDryRun = process.env.CAREERTWIN_DRY_RUN_EMAIL !== 'false';
  let supabaseHost = 'localhost';
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
    }
  } catch (_) {
    supabaseHost = 'invalid_url';
  }

  return NextResponse.json({
    status: 'ok',
    dry_run_email: isDryRun,
    environment: process.env.NODE_ENV || 'development',
    supabase_host: supabaseHost,
    timestamp: new Date().toISOString()
  });
}

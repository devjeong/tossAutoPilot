/**
 * 공개 환경 변수. 시크릿은 여기에 두지 않는다.
 */
export function getPublicEnv() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''

  return {
    supabaseUrl,
    supabaseAnonKey,
    hasSupabase: Boolean(supabaseUrl && supabaseAnonKey)
  }
}

export function getServerEnv() {
  const pub = getPublicEnv()
  return {
    ...pub,
    serviceRoleKey:
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '',
    databaseUrl: process.env.DATABASE_URL || '',
    credentialsMasterKey: process.env.CREDENTIALS_MASTER_KEY || '',
    engineUrl: process.env.ENGINE_URL || 'http://127.0.0.1:8787',
    engineInternalSecret: process.env.ENGINE_INTERNAL_SECRET || ''
  }
}

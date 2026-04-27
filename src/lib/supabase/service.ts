import { createClient } from '@supabase/supabase-js'

// Secret key client — bypasses RLS. Only use in server-side API routes.
// Uses SUPABASE_SERVICE_ROLE_KEY (legacy) or the new sb_secret_... key — never expose to the browser.
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

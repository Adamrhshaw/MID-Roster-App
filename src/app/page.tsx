import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user || process.env.DEV_BYPASS_AUTH === 'true') {
    redirect('/roster')
  } else {
    redirect('/login')
  }
}

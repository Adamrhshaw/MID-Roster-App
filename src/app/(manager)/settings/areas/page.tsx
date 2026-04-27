import { createServiceClient } from '@/lib/supabase/service'
import AreasManager from './components/AreasManager'

export default async function AreasPage() {
  const supabase = createServiceClient()
  const { data: areas } = await supabase.from('areas').select('*').order('name')

  return (
    <div className="p-6">
      <AreasManager initialAreas={areas ?? []} />
    </div>
  )
}

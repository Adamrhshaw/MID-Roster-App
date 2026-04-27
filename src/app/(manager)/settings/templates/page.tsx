import { createServiceClient } from '@/lib/supabase/service'
import type { Area, ShiftTemplate } from '@/types/database'
import TemplateGrid from './components/TemplateGrid'

export default async function TemplatesPage() {
  const supabase = createServiceClient()

  const [{ data: areas }, { data: templates }] = await Promise.all([
    supabase.from('areas').select('*').order('name'),
    supabase
      .from('shift_templates')
      .select('*, area:areas(id, name, min_staff_per_shift, created_at)')
      .order('area_id')
      .order('day_of_week')
      .order('shift_type'),
  ])

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Shift Templates</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Define the master shift pattern used to generate roster blocks. Each cell shows the number of staff required.
        </p>
      </div>

      {(!areas || areas.length === 0) ? (
        <div className="flex items-center justify-center h-32 rounded-lg border-2 border-dashed border-gray-200 text-sm text-gray-400">
          No areas configured — add areas in{' '}
          <a href="/settings/areas" className="ml-1 text-blue-500 hover:underline">Settings → Areas</a>{' '}
          first.
        </div>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          <TemplateGrid
            initialTemplates={(templates ?? []) as ShiftTemplate[]}
            areas={(areas ?? []) as Area[]}
          />
        </div>
      )}
    </div>
  )
}

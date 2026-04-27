import { createServiceClient } from '@/lib/supabase/service'
import StaffTable from './components/StaffTable'

export default async function StaffPage() {
  const supabase = createServiceClient()

  const [staffRes, areasRes] = await Promise.all([
    supabase
      .from('staff')
      .select(`
        *,
        primary_area:areas!staff_primary_area_id_fkey(id, name),
        staff_areas(area_id, is_primary, area:areas(id, name))
      `)
      .order('full_name'),
    supabase.from('areas').select('*').order('name'),
  ])

  const staff = (staffRes.data ?? []).map(s => ({
    ...s,
    areas: s.staff_areas?.map((sa: { area: { id: string; name: string } }) => sa.area).filter(Boolean) ?? [],
  }))

  return (
    <div className="p-6">
      <StaffTable
        initialStaff={staff}
        areas={areasRes.data ?? []}
      />
    </div>
  )
}

import { createServiceClient } from '@/lib/supabase/service'
import StaffTable from './components/StaffTable'

export default async function StaffPage() {
  const supabase = createServiceClient()

  const [staffRes, areasRes, certsRes] = await Promise.all([
    supabase
      .from('staff')
      .select(`
        *,
        primary_area:areas!staff_primary_area_id_fkey(id, name),
        staff_areas(area_id, is_primary, area:areas(id, name)),
        staff_certifications(certification_id, granted_date, expiry_date, certification:certifications(id, name))
      `)
      .order('full_name'),
    supabase.from('areas').select('*').order('name'),
    supabase.from('certifications').select('*').order('name'),
  ])

  // Flatten staff_areas into areas[] on each staff member for easier consumption
  const staff = (staffRes.data ?? []).map(s => ({
    ...s,
    areas: s.staff_areas?.map((sa: { area: { id: string; name: string } }) => sa.area).filter(Boolean) ?? [],
  }))

  return (
    <div className="p-6">
      <StaffTable
        initialStaff={staff}
        areas={areasRes.data ?? []}
        certifications={certsRes.data ?? []}
      />
    </div>
  )
}

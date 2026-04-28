import { createServiceClient } from '@/lib/supabase/service'
import LeaveTable from './components/LeaveTable'

export default async function LeavePage() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('leave_requests')
    .select('*, staff:staff_id(id, full_name, employee_id)')
    .order('created_at', { ascending: false })

  return (
    <div className="p-6">
      <LeaveTable initialRequests={data ?? []} />
    </div>
  )
}

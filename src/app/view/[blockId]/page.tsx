import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { AreaFilter } from './AreaFilter'
import PublicRosterGrid from './PublicRosterGrid'
import type { PublicArea, PublicStaff, PublicShift, PublicAssignment } from './PublicRosterGrid'

interface Props {
  params: Promise<{ blockId: string }>
  searchParams: Promise<{ highlight?: string; area?: string }>
}

export default async function PublicRosterViewPage({ params, searchParams }: Props) {
  const { blockId } = await params
  const { highlight, area: areaId } = await searchParams
  const supabase = await createClient()

  const { data: block } = await supabase
    .from('roster_blocks')
    .select('*')
    .eq('id', blockId)
    .eq('status', 'published')
    .single()

  if (!block) notFound()

  const [
    { data: shifts },
    { data: staffRows },
    { data: areas },
  ] = await Promise.all([
    supabase
      .from('shift_instances')
      .select('id, area_id, shift_type, shift_date')
      .eq('roster_block_id', blockId),
    supabase
      .from('staff')
      .select('id, full_name, employee_id')
      .eq('is_active', true),
    supabase
      .from('areas')
      .select('id, name, min_staff_per_shift')
      .order('name'),
  ])

  const shiftIds = (shifts ?? []).map((s: { id: string }) => s.id)
  const { data: assignments } = shiftIds.length > 0
    ? await supabase
        .from('assignments')
        .select('shift_instance_id, staff_id')
        .in('shift_instance_id', shiftIds)
        .neq('status', 'cancelled')
    : { data: [] as Array<{ shift_instance_id: string; staff_id: string }> }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-3 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-sm font-semibold text-gray-900">
              {block.name ?? `${block.start_date} – ${block.end_date}`}
            </h1>
            <p className="text-xs text-gray-500">Radiology Roster</p>
          </div>
          <div className="flex items-center gap-3">
            <AreaFilter
              areas={areas ?? []}
              currentAreaId={areaId ?? ''}
              blockId={blockId}
              highlight={highlight ?? ''}
            />
            <form>
              {areaId && <input type="hidden" name="area" value={areaId} />}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  name="highlight"
                  placeholder="Employee ID to highlight your shifts"
                  className="pl-9 w-72 h-8 text-sm"
                  defaultValue={highlight ?? ''}
                />
              </div>
            </form>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-auto">
        <PublicRosterGrid
          startDate={block.start_date}
          endDate={block.end_date}
          areas={(areas ?? []) as PublicArea[]}
          staff={(staffRows ?? []) as PublicStaff[]}
          shifts={(shifts ?? []) as PublicShift[]}
          assignments={(assignments ?? []) as PublicAssignment[]}
          areaId={areaId ?? null}
          highlight={highlight ?? null}
        />
      </div>
    </div>
  )
}

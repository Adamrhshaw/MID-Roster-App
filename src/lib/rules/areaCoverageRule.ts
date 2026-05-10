import type { RuleContext, Violation } from './types'
import type { Area } from '@/types/database'
import { fmtDate } from './dateFormat'

const SHIFT_LABEL: Record<string, string> = { morning: 'AM', afternoon: 'PM', night: 'NT', ado: 'ADO' }

// Coverage is a block-level rule — not per-staff. Call once with any ctx that has allAssignments.
export function areaCoverageRule(
  ctx: Pick<RuleContext, 'allAssignments'>,
  areas: Area[]
): Violation[] {
  const violations: Violation[] = []

  const areaMap = new Map(areas.map(a => [a.id, a]))

  // Group assignments by shift_instance_id
  const byInstance = new Map<string, { si: RuleContext['allAssignments'][0]['shift_instance']; count: number }>()
  for (const a of ctx.allAssignments) {
    const si = a.shift_instance
    if (!byInstance.has(si.id)) {
      byInstance.set(si.id, { si, count: 0 })
    }
    byInstance.get(si.id)!.count++
  }

  for (const { si, count } of byInstance.values()) {
    const area = areaMap.get(si.area_id)
    if (!area) continue
    if (count < area.min_staff_per_shift) {
      violations.push({
        rule: 'areaCoverage',
        name: 'Understaffed',
        severity: 'warning',
        message: `${area.name} ${SHIFT_LABEL[si.shift_type] ?? si.shift_type} · ${count}/${area.min_staff_per_shift} staff · ${fmtDate(si.shift_date)}`,
        staffId: '', // block-level — no single staff responsible
        shiftInstanceId: si.id,
      })
    }
  }

  return violations
}

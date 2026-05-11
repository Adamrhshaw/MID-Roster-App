'use client'

import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Area {
  id: string
  name: string
}

interface Props {
  areas: Area[]
  currentAreaId: string
  blockId: string
  highlight: string
}

export function AreaFilter({ areas, currentAreaId, blockId, highlight }: Props) {
  const router = useRouter()

  function handleChange(value: string | null) {
    const areaValue = value ?? ''
    const params = new URLSearchParams()
    if (areaValue) params.set('area', areaValue)
    if (highlight) params.set('highlight', highlight)
    const qs = params.toString()
    router.replace(`/view/${blockId}${qs ? `?${qs}` : ''}`)
  }

  return (
    <Select value={currentAreaId} onValueChange={handleChange}>
      <SelectTrigger size="sm" className="w-36">
        <SelectValue placeholder="All areas" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">All areas</SelectItem>
        {areas.map(a => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

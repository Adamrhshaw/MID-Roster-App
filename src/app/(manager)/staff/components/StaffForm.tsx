'use client'

import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Area, Certification, Staff } from '@/types/database'

export interface StaffFormValues {
  full_name: string
  employee_id: string
  email: string
  phone: string
  fte_target: string
  primary_area_id: string
  area_ids: string[]
  certification_ids: string[]
}

interface Props {
  areas: Area[]
  certifications: Certification[]
  initial?: Partial<StaffFormValues>
  onSubmit: (values: StaffFormValues) => Promise<void>
  onCancel: () => void
  submitLabel?: string
}

function defaultValues(initial?: Partial<StaffFormValues>): StaffFormValues {
  return {
    full_name: initial?.full_name ?? '',
    employee_id: initial?.employee_id ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    fte_target: initial?.fte_target ?? '1.0',
    primary_area_id: initial?.primary_area_id ?? '',
    area_ids: initial?.area_ids ?? [],
    certification_ids: initial?.certification_ids ?? [],
  }
}

export function staffToFormValues(staff: Staff): StaffFormValues {
  return {
    full_name: staff.full_name,
    employee_id: staff.employee_id,
    email: staff.email,
    phone: staff.phone ?? '',
    fte_target: String(staff.fte_target),
    primary_area_id: staff.primary_area_id ?? '',
    area_ids: staff.areas?.map(a => a.id) ?? [],
    certification_ids: staff.certifications?.map(c => c.certification_id) ?? [],
  }
}

export default function StaffForm({ areas, certifications, initial, onSubmit, onCancel, submitLabel = 'Save' }: Props) {
  const [values, setValues] = useState<StaffFormValues>(defaultValues(initial))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof StaffFormValues>(key: K, value: StaffFormValues[K]) {
    setValues(prev => ({ ...prev, [key]: value }))
  }

  function toggleArrayValue(key: 'area_ids' | 'certification_ids', id: string) {
    setValues(prev => {
      const arr = prev[key]
      return { ...prev, [key]: arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id] }
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!values.full_name.trim() || !values.employee_id.trim() || !values.email.trim()) {
      setError('Name, Employee ID, and Email are required.')
      return
    }
    const fte = parseFloat(values.fte_target)
    if (isNaN(fte) || fte <= 0 || fte > 1) {
      setError('FTE must be between 0.01 and 1.0')
      return
    }
    setLoading(true)
    try {
      await onSubmit(values)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="sf-name">Full name</Label>
          <Input id="sf-name" value={values.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Jane Smith" required />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sf-empid">Employee ID</Label>
          <Input id="sf-empid" value={values.employee_id} onChange={e => set('employee_id', e.target.value)} placeholder="EMP001" required />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sf-fte">FTE</Label>
          <Input id="sf-fte" type="number" step="0.05" min="0.1" max="1.0" value={values.fte_target} onChange={e => set('fte_target', e.target.value)} required />
        </div>

        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="sf-email">Email</Label>
          <Input id="sf-email" type="email" value={values.email} onChange={e => set('email', e.target.value)} placeholder="jane@hospital.org" required />
        </div>

        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="sf-phone">Phone <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="sf-phone" type="tel" value={values.phone} onChange={e => set('phone', e.target.value)} placeholder="+61 400 000 000" />
        </div>

        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Primary area</Label>
          <Select value={values.primary_area_id} onValueChange={v => {
            const val = v ?? ''
            set('primary_area_id', val)
            if (val && !values.area_ids.includes(val)) {
              set('area_ids', [...values.area_ids, val])
            }
          }}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select area…" />
            </SelectTrigger>
            <SelectContent>
              {areas.map(a => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {areas.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label>Eligible areas</Label>
          <div className="flex flex-wrap gap-2">
            {areas.map(a => {
              const checked = values.area_ids.includes(a.id)
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleArrayValue('area_ids', a.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    checked
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {a.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {certifications.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label>Certifications</Label>
          <div className="flex flex-wrap gap-2">
            {certifications.map(c => {
              const checked = values.certification_ids.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleArrayValue('certification_ids', c.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    checked
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {c.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}

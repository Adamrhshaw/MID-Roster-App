import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { LayoutGrid, Building2 } from 'lucide-react'

const settingsSections = [
  {
    href: '/settings/templates',
    icon: LayoutGrid,
    title: 'Shift Templates',
    description: 'Define the master shift pattern — required staff counts per area, day, and shift type.',
  },
  {
    href: '/settings/areas',
    icon: Building2,
    title: 'Areas',
    description: 'Manage modality areas (X-Ray, Ultrasound, CT) and their minimum staffing levels.',
  },
]

export default function SettingsPage() {
  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h1 className="text-lg font-semibold">Settings</h1>
      <div className="grid gap-4">
        {settingsSections.map(({ href, icon: Icon, title, description }) => (
          <Link key={href} href={href}>
            <Card className="hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-4 w-4 text-blue-600" />
                  {title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{description}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

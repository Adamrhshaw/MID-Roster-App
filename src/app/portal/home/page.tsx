import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CalendarDays, List, FileText, ArrowLeftRight } from 'lucide-react'

export default function PortalHomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-gray-900">Radiology Roster</h1>
            <p className="text-xs text-gray-500">Staff Portal</p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4">
        <Tabs defaultValue="calendar">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="calendar" className="gap-1.5 text-xs">
              <CalendarDays className="h-3.5 w-3.5" />
              Calendar
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-1.5 text-xs">
              <List className="h-3.5 w-3.5" />
              List
            </TabsTrigger>
            <TabsTrigger value="leave" className="gap-1.5 text-xs">
              <FileText className="h-3.5 w-3.5" />
              Leave
            </TabsTrigger>
            <TabsTrigger value="swap" className="gap-1.5 text-xs">
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Swap
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calendar" className="mt-4">
            <div className="flex items-center justify-center h-64 rounded-lg border-2 border-dashed border-gray-200 text-sm text-gray-400">
              Roster calendar — connect Supabase first.
            </div>
          </TabsContent>

          <TabsContent value="list" className="mt-4">
            <div className="flex items-center justify-center h-64 rounded-lg border-2 border-dashed border-gray-200 text-sm text-gray-400">
              Shift list — connect Supabase first.
            </div>
          </TabsContent>

          <TabsContent value="leave" className="mt-4">
            <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
              <h2 className="font-medium text-sm">Request Leave</h2>
              <p className="text-sm text-gray-400">Leave request form — coming soon.</p>
            </div>
          </TabsContent>

          <TabsContent value="swap" className="mt-4">
            <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
              <h2 className="font-medium text-sm">Request Shift Swap</h2>
              <p className="text-sm text-gray-400">Shift swap form — coming soon.</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

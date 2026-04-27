import { AppNav } from '@/components/layout/AppNav'

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <AppNav />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}

import { requireAdmin } from '@/lib/supabase/admin'
import AdminShell from '@/components/admin/AdminShell'

export const metadata = { title: 'Admin Dashboard' }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAdmin()
  return <AdminShell adminProfile={profile}>{children}</AdminShell>
}

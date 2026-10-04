import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useSession } from '@/lib/auth-client'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession()
  const location = useLocation()

  if (isPending) return null
  if (!data) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

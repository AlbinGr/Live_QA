import { LogOut } from 'lucide-react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Brand } from './Brand'
import { supabase } from '../lib/supabase'
import { useAuth } from '../features/auth/AuthContext'

export function AppShell() {
  const navigate = useNavigate()
  const { user } = useAuth()

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-forest/10 bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Brand />
          <div className="flex items-center gap-3">
            <span className="hidden max-w-56 truncate text-sm text-ink/60 sm:block">{user?.email}</span>
            <button type="button" onClick={() => void signOut()} className="btn-secondary px-3" aria-label="Sign out">
              <LogOut className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  )
}

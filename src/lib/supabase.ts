import { createClient } from '@supabase/supabase-js'
import { withTimeout } from './errors'

const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const configuredKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const isSupabaseConfigured = Boolean(
  configuredUrl &&
    configuredKey &&
    !configuredUrl.includes('YOUR_PROJECT') &&
    !configuredKey.includes('YOUR_'),
)

// Placeholder values let the static app render a useful setup screen before .env exists.
const supabaseUrl = configuredUrl || 'https://placeholder.supabase.co'
const supabaseKey = configuredKey || 'placeholder-publishable-key'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
})

export async function ensureStudentAuth(): Promise<void> {
  const { data, error } = await withTimeout(supabase.auth.getSession())
  if (error) throw error
  if (data.session) return

  const { error: signInError } = await withTimeout(supabase.auth.signInAnonymously())
  if (signInError) throw signInError
}

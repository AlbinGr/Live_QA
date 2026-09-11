import { ExternalLink, Settings } from 'lucide-react'
import { Brand } from './Brand'

export function SetupRequired() {
  return (
    <main className="grid min-h-screen place-items-center p-5">
      <section className="card w-full max-w-xl p-7 sm:p-10">
        <Brand />
        <div className="mt-8 grid size-12 place-items-center rounded-2xl bg-gold/25 text-[#795b0d]">
          <Settings className="size-6" aria-hidden="true" />
        </div>
        <h1 className="mt-5 font-display text-3xl font-extrabold text-forest">Connect your Supabase project</h1>
        <p className="mt-3 leading-7 text-ink/65">
          The app is built and ready. Copy <code className="rounded bg-forest/5 px-1.5 py-0.5">.env.example</code> to <code className="rounded bg-forest/5 px-1.5 py-0.5">.env.local</code>, add your project URL and publishable key, then restart the development server.
        </p>
        <a className="btn-primary mt-7" href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">
          Open Supabase <ExternalLink className="size-4" aria-hidden="true" />
        </a>
      </section>
    </main>
  )
}

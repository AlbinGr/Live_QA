import { ArrowRight, BarChart3, CheckCircle2, QrCode, Sparkles, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Brand } from '../components/Brand'

export function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Brand />
        <div className="flex items-center gap-2">
          <Link to="/join" className="btn-secondary border-transparent bg-transparent">Join a room</Link>
          <Link to="/login" className="btn-primary">Teacher login</Link>
        </div>
      </nav>

      <section className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-12 sm:px-8 lg:grid-cols-[1.03fr_.97fr] lg:pb-28 lg:pt-20">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-pine/15 bg-mint/60 px-3 py-1.5 text-sm font-semibold text-pine">
            <Sparkles className="size-4" aria-hidden="true" /> Every voice, in the moment
          </div>
          <h1 className="mt-6 max-w-3xl font-display text-5xl font-extrabold leading-[1.04] tracking-[-0.045em] text-forest sm:text-6xl lg:text-7xl">
            Ask. Answer.<br /><span className="text-coral">See the room think.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-ink/65 sm:text-xl">
            Run live classroom questions without slowing down the class. Students scan, answer, and appear in your results instantly—no student accounts.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link to="/login" className="btn-primary px-6 py-3.5 text-base">Start a session <ArrowRight className="size-5" aria-hidden="true" /></Link>
            <Link to="/join" className="btn-secondary px-6 py-3.5 text-base">I have a code</Link>
          </div>
          <div className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink/55">
            {['No student signup', 'Works on any phone', 'Answers saved'].map((item) => (
              <span className="inline-flex items-center gap-1.5" key={item}><CheckCircle2 className="size-4 text-pine" aria-hidden="true" /> {item}</span>
            ))}
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xl lg:mx-0">
          <div className="absolute -left-8 -top-10 size-36 rounded-full bg-gold/25 blur-3xl" />
          <div className="absolute -bottom-10 -right-8 size-44 rounded-full bg-coral/15 blur-3xl" />
          <div className="card relative overflow-hidden p-5 sm:p-7">
            <div className="flex items-center justify-between">
              <div>
                <p className="eyebrow">Live now</p>
                <h2 className="mt-1 font-display text-xl font-bold">Intro to ecosystems</h2>
              </div>
              <span className="flex items-center gap-1.5 rounded-full bg-mint px-3 py-1.5 text-sm font-bold text-pine"><span className="size-2 animate-pulse rounded-full bg-[#2ea47f]" /> 28 joined</span>
            </div>
            <div className="mt-7 rounded-2xl bg-forest p-6 text-white">
              <span className="text-sm font-semibold text-white/55">Question 3</span>
              <p className="mt-2 font-display text-2xl font-bold leading-tight">Which organism is a primary producer?</p>
            </div>
            <div className="mt-5 space-y-3">
              {[
                ['Oak tree', 17, '68%'],
                ['Fox', 3, '12%'],
                ['Mushroom', 5, '20%'],
              ].map(([label, count, percent], index) => (
                <div className="grid grid-cols-[1fr_auto] gap-3" key={String(label)}>
                  <div>
                    <div className="mb-1.5 flex justify-between text-sm font-semibold"><span>{label}</span><span>{percent}</span></div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-forest/8"><div className={`h-full rounded-full ${index === 0 ? 'bg-pine' : 'bg-coral'}`} style={{ width: String(percent) }} /></div>
                  </div>
                  <span className="mt-5 w-6 text-right text-sm tabular-nums text-ink/50">{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="absolute -bottom-8 -left-4 hidden items-center gap-3 rounded-2xl border border-forest/10 bg-white p-4 shadow-card sm:flex">
            <div className="grid size-11 place-items-center rounded-xl bg-mint text-pine"><QrCode className="size-6" aria-hidden="true" /></div>
            <div><p className="text-xs font-semibold text-ink/45">Join code</p><p className="font-display text-xl font-extrabold tracking-[.15em]">K7M4Q</p></div>
          </div>
        </div>
      </section>

      <section className="bg-forest px-5 py-16 text-white sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-3">
          {[
            [QrCode, 'One scan to join', 'Share a large QR code or short link. Students arrive in seconds.'],
            [Users, 'Made for live teaching', 'Create and launch a question without leaving the control room.'],
            [BarChart3, 'Results you can use', 'Reveal clear charts now, then revisit history and export later.'],
          ].map(([Icon, title, body]) => {
            const FeatureIcon = Icon as typeof QrCode
            return (
              <article key={String(title)} className="rounded-3xl border border-white/10 bg-white/[.055] p-6">
                <FeatureIcon className="size-7 text-gold" aria-hidden="true" />
                <h3 className="mt-5 font-display text-xl font-bold">{String(title)}</h3>
                <p className="mt-2 leading-7 text-white/60">{String(body)}</p>
              </article>
            )
          })}
        </div>
      </section>
    </main>
  )
}

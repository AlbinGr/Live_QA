import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { PageLoader } from './components/Feedback'
import { useAuth } from './features/auth/AuthContext'

const LandingPage = lazy(() => import('./pages/LandingPage').then((module) => ({ default: module.LandingPage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })))
const JoinPage = lazy(() => import('./pages/JoinPage').then((module) => ({ default: module.JoinPage })))
const StudentSessionPage = lazy(() => import('./pages/StudentSessionPage').then((module) => ({ default: module.StudentSessionPage })))
const TeacherDashboardPage = lazy(() => import('./pages/TeacherDashboardPage').then((module) => ({ default: module.TeacherDashboardPage })))
const TeacherSessionPage = lazy(() => import('./pages/TeacherSessionPage').then((module) => ({ default: module.TeacherSessionPage })))
const SessionHistoryPage = lazy(() => import('./pages/SessionHistoryPage').then((module) => ({ default: module.SessionHistoryPage })))
const PresentationPage = lazy(() => import('./pages/PresentationPage').then((module) => ({ default: module.PresentationPage })))

function TeacherOnly() {
  const { loading, isTeacher } = useAuth()
  if (loading) return <PageLoader label="Checking your account…" />
  if (!isTeacher) return <Navigate to="/login" replace />
  return <Outlet />
}

function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-5 text-center">
      <div><p className="eyebrow">404</p><h1 className="mt-2 font-display text-4xl font-extrabold text-forest">That page isn’t here.</h1><a href="/" className="btn-primary mt-6">Go home</a></div>
    </main>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader label="Opening Pulse…" />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/join/:code" element={<JoinPage />} />
        <Route path="/session/:code" element={<StudentSessionPage />} />

        <Route element={<TeacherOnly />}>
          <Route path="/teacher/session/:sessionId/present" element={<PresentationPage />} />
          <Route element={<AppShell />}>
            <Route path="/teacher" element={<TeacherDashboardPage />} />
            <Route path="/teacher/session/:sessionId" element={<TeacherSessionPage />} />
            <Route path="/teacher/session/:sessionId/history" element={<SessionHistoryPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import { Dashboard } from './pages/Dashboard'
import { Chat } from './pages/Chat'
import { Login } from './pages/Login'
import { Students } from './pages/Students'
import { Grades } from './pages/Grades'
import { Attendance } from './pages/Attendance'
import { Finance } from './pages/Finance'
import { Timetable } from './pages/Timetable'
import { isAuthenticated, logout } from './services/api'

const NAV_LINKS = [
  { to: '/dashboard',  label: 'Tableau de bord' },
  { to: '/students',   label: 'Élèves' },
  { to: '/attendance', label: 'Présences' },
  { to: '/grades',     label: 'Notes' },
  { to: '/finance',    label: 'Finance' },
  { to: '/timetable',  label: 'Emploi du temps' },
  { to: '/chat',       label: 'OostudyBot' },
]

function navClass({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive ? 'bg-blue-700 text-white' : 'text-blue-100 hover:bg-blue-700/50'
  }`
}

function ProtectedLayout() {
  const navigate = useNavigate()

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-blue-800 flex flex-col">
        <div className="px-4 py-5 border-b border-blue-700">
          <span className="font-bold text-white text-base leading-tight">ERP Scolaire<br />360°</span>
        </div>
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {NAV_LINKS.map(({ to, label }) => (
            <NavLink key={to} to={to} className={navClass}>{label}</NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-blue-700">
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-blue-200 hover:bg-blue-700/50 hover:text-white transition-colors"
          >
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"  element={<Dashboard />} />
          <Route path="/students"   element={<Students />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/grades"     element={<Grades />} />
          <Route path="/finance"    element={<Finance />} />
          <Route path="/timetable"  element={<Timetable />} />
          <Route path="/chat"       element={<Chat />} />
          <Route path="*"           element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*"     element={<ProtectedLayout />} />
    </Routes>
  )
}

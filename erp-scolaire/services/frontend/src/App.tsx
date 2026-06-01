import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { Dashboard } from './pages/Dashboard'
import { Chat } from './pages/Chat'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
  }`

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Navbar */}
      <header className="h-16 border-b bg-white shadow-sm flex items-center px-6 gap-6">
        <span className="font-bold text-blue-700 text-lg">ERP Scolaire 360°</span>
        <nav className="flex gap-2">
          <NavLink to="/dashboard" className={navClass}>Tableau de bord</NavLink>
          <NavLink to="/chat"      className={navClass}>OostudyBot</NavLink>
        </nav>
      </header>

      {/* Content */}
      <main className="flex-1">
        <Routes>
          <Route path="/"          element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/chat"      element={<Chat />} />
        </Routes>
      </main>
    </div>
  )
}

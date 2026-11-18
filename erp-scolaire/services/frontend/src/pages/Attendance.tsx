import { useEffect, useState } from 'react'

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''
function authHeader() {
  const t = localStorage.getItem('erp_token')
  return t ? { Authorization: `Bearer ${t}` } : {}
}

type Statut = 'present' | 'absent' | 'retard'

interface AttendanceRecord {
  eleve_id: string
  eleve_nom: string
  eleve_prenom: string
  statut: Statut
  heure: string
}

interface WeekSummary {
  date: string
  presents: number
  absents: number
  retards: number
}

const statutStyle: Record<Statut, string> = {
  present: 'bg-green-100 text-green-700',
  absent: 'bg-red-100 text-red-700',
  retard: 'bg-orange-100 text-orange-700',
}

const statutLabel: Record<Statut, string> = {
  present: 'Présent',
  absent: 'Absent',
  retard: 'Retard',
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export function Attendance() {
  const [date, setDate] = useState(today())
  const [classe, setClasse] = useState('')
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [weekly, setWeekly] = useState<WeekSummary[]>([])
  const [classes, setClasses] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ date })
    if (classe) params.set('classe', classe)
    fetch(`${BASE}/api/v1/attendance?${params}`, { headers: authHeader() })
      .then((r) => r.json())
      .then((d: { data: AttendanceRecord[]; weekly: WeekSummary[]; classes: string[] }) => {
        setRecords(d.data ?? [])
        setWeekly(d.weekly ?? [])
        setClasses(d.classes ?? [])
      })
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }, [date, classe])

  const maxCount = Math.max(...weekly.map((w) => w.presents + w.absents + w.retards), 1)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Présences</h1>
        <div className="flex gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select value={classe} onChange={(e) => setClasse(e.target.value)} className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Toutes les classes</option>
            {classes.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Weekly bar chart */}
      {weekly.length > 0 && (
        <div className="bg-white rounded-xl border p-4 mb-6">
          <p className="text-sm font-semibold text-gray-600 mb-3">Résumé hebdomadaire</p>
          <div className="flex items-end gap-2 h-24">
            {weekly.map((w) => {
              const total = w.presents + w.absents + w.retards
              const h = Math.round((total / maxCount) * 80)
              const pct = total > 0 ? Math.round((w.presents / total) * 100) : 0
              return (
                <div key={w.date} className="flex flex-col items-center flex-1 gap-1">
                  <span className="text-xs text-gray-400">{pct}%</span>
                  <div className="w-full rounded-t" style={{ height: h, background: `linear-gradient(to top, #ef4444 ${100 - pct}%, #22c55e ${100 - pct}%)` }} title={`${w.date}: ${w.presents} présents, ${w.absents} absents, ${w.retards} retards`} />
                  <span className="text-xs text-gray-500">{w.date.slice(5)}</span>
                </div>
              )
            })}
          </div>
          <div className="flex gap-4 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" />Présent</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" />Absent</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-orange-400 inline-block" />Retard</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-500 py-12">Chargement…</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Élève', 'Statut', 'Heure'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.eleve_id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{r.eleve_prenom} {r.eleve_nom}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statutStyle[r.statut]}`}>
                      {statutLabel[r.statut]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{r.heure ?? '—'}</td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">Aucune donnée de présence</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

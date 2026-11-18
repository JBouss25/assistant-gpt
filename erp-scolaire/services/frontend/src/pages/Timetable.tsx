import { useEffect, useState } from 'react'

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''
function authHeader() {
  const t = localStorage.getItem('erp_token')
  return t ? { Authorization: `Bearer ${t}` } : {}
}

interface Slot {
  jour: number       // 1=Lundi … 6=Samedi
  heure_debut: number // e.g. 8
  heure_fin: number   // e.g. 10
  matiere: string
  enseignant: string
  salle: string
}

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const HOURS = Array.from({ length: 11 }, (_, i) => i + 8) // 8h → 18h

const COLORS = [
  'bg-blue-100 text-blue-800 border-blue-200',
  'bg-green-100 text-green-800 border-green-200',
  'bg-purple-100 text-purple-800 border-purple-200',
  'bg-yellow-100 text-yellow-800 border-yellow-200',
  'bg-pink-100 text-pink-800 border-pink-200',
  'bg-indigo-100 text-indigo-800 border-indigo-200',
  'bg-orange-100 text-orange-800 border-orange-200',
  'bg-teal-100 text-teal-800 border-teal-200',
]

export function Timetable() {
  const [slots, setSlots] = useState<Slot[]>([])
  const [classe, setClasse] = useState('')
  const [classes, setClasses] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`${BASE}/api/v1/admin/classes`, { headers: authHeader() })
      .then((r) => r.json())
      .then((d: { data: { nom: string }[] }) => setClasses((d.data ?? []).map((c) => c.nom)))
      .catch(() => setClasses([]))
  }, [])

  useEffect(() => {
    if (!classe) return
    setLoading(true)
    fetch(`${BASE}/api/v1/timetable?classe=${encodeURIComponent(classe)}`, { headers: authHeader() })
      .then((r) => r.json())
      .then((d: { slots: Slot[] }) => setSlots(d.slots ?? []))
      .catch(() => setSlots([]))
      .finally(() => setLoading(false))
  }, [classe])

  // Build subject → color map
  const subjectColors = [...new Set(slots.map((s) => s.matiere))].reduce<Record<string, string>>((acc, m, i) => {
    acc[m] = COLORS[i % COLORS.length]
    return acc
  }, {})

  function getSlot(jour: number, heure: number): Slot | undefined {
    return slots.find((s) => s.jour === jour && s.heure_debut <= heure && s.heure_fin > heure)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Emploi du temps</h1>
        <select
          value={classe}
          onChange={(e) => setClasse(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Sélectionner une classe</option>
          {classes.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      {!classe && (
        <div className="text-center text-gray-400 py-16">Sélectionnez une classe pour afficher l'emploi du temps</div>
      )}

      {classe && loading && (
        <div className="text-center text-gray-500 py-12">Chargement…</div>
      )}

      {classe && !loading && (
        <div className="bg-white rounded-xl shadow-sm border overflow-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border px-3 py-2 text-gray-500 w-16">Heure</th>
                {JOURS.map((j) => (
                  <th key={j} className="border px-3 py-2 font-semibold text-gray-700">{j}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HOURS.map((h) => (
                <tr key={h}>
                  <td className="border px-3 py-2 text-gray-400 text-center whitespace-nowrap bg-gray-50">{h}h</td>
                  {JOURS.map((_, idx) => {
                    const slot = getSlot(idx + 1, h)
                    if (!slot) return <td key={idx} className="border px-2 py-2 h-10" />
                    const colorClass = subjectColors[slot.matiere] ?? COLORS[0]
                    // Only render on first hour of slot to avoid duplicates
                    if (slot.heure_debut !== h) return <td key={idx} className="border" />
                    const span = slot.heure_fin - slot.heure_debut
                    return (
                      <td key={idx} rowSpan={span} className={`border px-2 py-1 align-top rounded-sm ${colorClass} border`}>
                        <p className="font-semibold leading-tight">{slot.matiere}</p>
                        <p className="text-opacity-70 mt-0.5">{slot.enseignant}</p>
                        <p className="text-opacity-50">{slot.salle}</p>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      {Object.keys(subjectColors).length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(subjectColors).map(([m, c]) => (
            <span key={m} className={`px-2 py-0.5 rounded text-xs border ${c}`}>{m}</span>
          ))}
        </div>
      )}
    </div>
  )
}

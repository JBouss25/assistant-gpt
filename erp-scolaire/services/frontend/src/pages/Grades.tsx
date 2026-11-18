import { useEffect, useState } from 'react'

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''
function authHeader() {
  const t = localStorage.getItem('erp_token')
  return t ? { Authorization: `Bearer ${t}` } : {}
}

interface Grade {
  id: string
  eleve_id: string
  eleve_nom: string
  eleve_prenom: string
  matiere: string
  note: number
  coefficient: number
  periode: string
  classe: string
}

function noteColor(n: number) {
  if (n < 10) return 'text-red-600 font-bold'
  if (n < 12) return 'text-orange-500 font-semibold'
  if (n < 16) return 'text-green-600 font-semibold'
  return 'text-blue-600 font-bold'
}

export function Grades() {
  const [grades, setGrades] = useState<Grade[]>([])
  const [loading, setLoading] = useState(true)
  const [classe, setClasse] = useState('')
  const [matiere, setMatiere] = useState('')
  const [classes, setClasses] = useState<string[]>([])
  const [matieres, setMatieres] = useState<string[]>([])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '100' })
    if (classe) params.set('classe', classe)
    if (matiere) params.set('matiere', matiere)
    fetch(`${BASE}/api/v1/gradebook/grades?${params}`, { headers: authHeader() })
      .then((r) => r.json())
      .then((d: { data: Grade[] }) => {
        const data = d.data ?? []
        setGrades(data)
        setClasses([...new Set(data.map((g) => g.classe))].sort())
        setMatieres([...new Set(data.map((g) => g.matiere))].sort())
      })
      .catch(() => setGrades([]))
      .finally(() => setLoading(false))
  }, [classe, matiere])

  const averageByEleve = grades.reduce<Record<string, { nom: string; total: number; coef: number }>>((acc, g) => {
    const key = g.eleve_id
    if (!acc[key]) acc[key] = { nom: `${g.eleve_prenom} ${g.eleve_nom}`, total: 0, coef: 0 }
    acc[key].total += g.note * g.coefficient
    acc[key].coef += g.coefficient
    return acc
  }, {})

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Notes</h1>
        <div className="flex gap-3">
          <select value={classe} onChange={(e) => setClasse(e.target.value)} className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Toutes les classes</option>
            {classes.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select value={matiere} onChange={(e) => setMatiere(e.target.value)} className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Toutes les matières</option>
            {matieres.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Average summary */}
      {Object.keys(averageByEleve).length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(averageByEleve).slice(0, 4).map(([id, e]) => {
            const avg = e.coef > 0 ? e.total / e.coef : 0
            return (
              <div key={id} className="bg-white rounded-lg border p-3 text-sm">
                <p className="text-gray-500 truncate">{e.nom}</p>
                <p className={`text-lg mt-1 ${noteColor(avg)}`}>{avg.toFixed(2)}/20</p>
              </div>
            )
          })}
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-500 py-12">Chargement…</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Élève', 'Matière', 'Note /20', 'Coefficient', 'Période'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grades.map((g) => (
                <tr key={g.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{g.eleve_prenom} {g.eleve_nom}</td>
                  <td className="px-4 py-3 text-gray-600">{g.matiere}</td>
                  <td className={`px-4 py-3 ${noteColor(g.note)}`}>{g.note}/20</td>
                  <td className="px-4 py-3 text-gray-500">{g.coefficient}</td>
                  <td className="px-4 py-3 text-gray-500">{g.periode}</td>
                </tr>
              ))}
              {grades.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Aucune note trouvée</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

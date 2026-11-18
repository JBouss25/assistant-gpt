import { useEffect, useState } from 'react'
import { getRisk, type RiskResult } from '../services/api'
import { RiskBadge } from '../components/RiskBadge'

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''
function authHeader() {
  const t = localStorage.getItem('erp_token')
  return t ? { Authorization: `Bearer ${t}` } : {}
}

interface Student {
  id: string
  nom: string
  prenom: string
  matricule: string
  classe: string
  statut: 'actif' | 'inactif'
}

const PAGE_SIZE = 20

export function Students() {
  const [students, setStudents] = useState<Student[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Student | null>(null)
  const [risk, setRisk] = useState<RiskResult | null>(null)
  const [riskLoading, setRiskLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
    if (search) params.set('search', search)
    fetch(`${BASE}/api/v1/admin/students?${params}`, { headers: authHeader() })
      .then((r) => r.json())
      .then((d: { data: Student[]; total: number }) => { setStudents(d.data ?? []); setTotal(d.total ?? 0) })
      .catch(() => setStudents([]))
      .finally(() => setLoading(false))
  }, [page, search])

  function openStudent(s: Student) {
    setSelected(s)
    setRisk(null)
    setRiskLoading(true)
    getRisk(s.id).then(setRisk).catch(() => setRisk(null)).finally(() => setRiskLoading(false))
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Élèves</h1>
        <input
          type="text"
          placeholder="Rechercher un élève…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="border border-gray-300 rounded-lg px-4 py-2 w-64 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-12">Chargement…</div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Matricule', 'Nom', 'Prénom', 'Classe', 'Statut'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => openStudent(s)}
                    className="border-b last:border-0 hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-gray-500">{s.matricule}</td>
                    <td className="px-4 py-3 font-medium">{s.nom}</td>
                    <td className="px-4 py-3">{s.prenom}</td>
                    <td className="px-4 py-3">{s.classe}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.statut === 'actif' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {s.statut}
                      </span>
                    </td>
                  </tr>
                ))}
                {students.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Aucun élève trouvé</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
            <span>{total} élève{total !== 1 ? 's' : ''}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded border disabled:opacity-40">Précédent</button>
              <span className="px-3 py-1">{page} / {totalPages || 1}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 rounded border disabled:opacity-40">Suivant</button>
            </div>
          </div>
        </>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-1">{selected.prenom} {selected.nom}</h2>
            <p className="text-gray-500 text-sm mb-4">{selected.matricule} · {selected.classe}</p>
            {riskLoading && <p className="text-gray-400 text-sm">Calcul du risque…</p>}
            {risk && (
              <div>
                <p className="text-sm font-medium text-gray-600 mb-2">Risque de décrochage</p>
                <RiskBadge level={risk.risk_level} score={risk.risk_score} />
                {risk.top_factors.length > 0 && (
                  <ul className="mt-3 text-sm text-gray-600 space-y-1">
                    {risk.top_factors.map((f) => <li key={f} className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />{f}</li>)}
                  </ul>
                )}
              </div>
            )}
            <button onClick={() => setSelected(null)} className="mt-6 w-full py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors">Fermer</button>
          </div>
        </div>
      )}
    </div>
  )
}

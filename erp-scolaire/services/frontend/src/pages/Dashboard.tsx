import { useEffect, useState } from 'react'
import { getDashboard, type DashboardData } from '../services/api'
import { StatCard } from '../components/StatCard'

const SCHOOL_ID = localStorage.getItem('erp_school_id') ?? 'demo-school-id'

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDashboard(SCHOOL_ID)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center text-gray-500">Chargement du tableau de bord…</div>
  if (error)   return <div className="p-8 text-center text-red-600">Erreur : {error}</div>
  if (!data)   return null

  return (
    <div className="space-y-8 p-6">
      <h1>Tableau de bord — Vue directeur</h1>

      {/* ── Présence ─────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-gray-600">Présence</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Effectif total"
            value={data.attendance.total_eleves}
            color="blue"
          />
          <StatCard
            label="Absents aujourd'hui"
            value={data.attendance.absents_aujourd_hui}
            color={data.attendance.absents_aujourd_hui > 10 ? 'red' : 'green'}
          />
          <StatCard
            label="Taux de présence (jour)"
            value={`${data.attendance.taux_presence_jour}%`}
            color={data.attendance.taux_presence_jour >= 90 ? 'green' : 'yellow'}
          />
          <StatCard
            label="Absences (7 jours)"
            value={data.attendance.absences_semaine}
            color="yellow"
          />
        </div>
        {data.attendance.top_absentees.length > 0 && (
          <div className="mt-4 rounded-lg border border-red-100 bg-red-50 p-4">
            <p className="mb-2 text-sm font-semibold text-red-700">Top absentéistes (30 jours)</p>
            <ul className="space-y-1 text-sm text-red-600">
              {data.attendance.top_absentees.map((a) => (
                <li key={a.eleve_id}>{a.nom} — {a.count} absences</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── Notes ────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-gray-600">Notes</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Moyenne école"
            value={`${data.grades.moyenne_ecole}/20`}
            color={data.grades.moyenne_ecole >= 12 ? 'green' : data.grades.moyenne_ecole >= 10 ? 'yellow' : 'red'}
          />
          {data.grades.distribution.map((d) => (
            <StatCard key={d.tranche} label={`Notes ${d.tranche}`} value={d.count} color="blue" />
          ))}
        </div>
        {data.grades.matieres_faibles.length > 0 && (
          <div className="mt-4 rounded-lg border border-yellow-100 bg-yellow-50 p-4">
            <p className="mb-2 text-sm font-semibold text-yellow-700">Matières sous la moyenne</p>
            <ul className="space-y-1 text-sm text-yellow-700">
              {data.grades.matieres_faibles.map((m) => (
                <li key={m.matiere}>{m.matiere} — {m.moyenne}/20</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── Finance ──────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-gray-600">Finance</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Attendu ce mois" value={`${data.finance.total_attendu_mois.toLocaleString()} MAD`} color="blue" />
          <StatCard label="Encaissé ce mois" value={`${data.finance.total_encaisse_mois.toLocaleString()} MAD`} color="green" />
          <StatCard
            label="Taux de recouvrement"
            value={`${data.finance.taux_recouvrement}%`}
            color={data.finance.taux_recouvrement >= 80 ? 'green' : 'red'}
          />
          <StatCard label="Impayés total" value={`${data.finance.impayees_montant.toLocaleString()} MAD`} color="red" />
        </div>
      </section>

      {/* ── LMS ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-gray-600">LMS</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Complétion moyenne" value={`${data.lms.taux_completion_moyen}%`} color={data.lms.taux_completion_moyen >= 60 ? 'green' : 'yellow'} />
          <StatCard label="Cours publiés" value={data.lms.cours_publies} color="blue" />
          <StatCard label="Devoirs en cours" value={data.lms.devoirs_en_attente} color="blue" />
          <StatCard label="Rendus à temps" value={`${data.lms.soumissions_a_temps}%`} color={data.lms.soumissions_a_temps >= 80 ? 'green' : 'yellow'} />
        </div>
      </section>
    </div>
  )
}

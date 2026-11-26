import { useEffect, useState } from 'react'
import { StatCard } from '../components/StatCard'

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''
function authHeader() {
  const t = localStorage.getItem('erp_token')
  return t ? { Authorization: `Bearer ${t}` } : {}
}

type InvoiceStatus = 'paid' | 'unpaid' | 'partial'

interface Invoice {
  id: string
  eleve_nom: string
  eleve_prenom: string
  montant: number
  montant_paye: number
  statut: InvoiceStatus
  echeance: string
}

interface FinanceSummary {
  total_facture: number
  total_paye: number
  taux_recouvrement: number
}

const statusStyle: Record<InvoiceStatus, string> = {
  paid: 'bg-green-100 text-green-700',
  unpaid: 'bg-red-100 text-red-700',
  partial: 'bg-orange-100 text-orange-700',
}

const statusLabel: Record<InvoiceStatus, string> = {
  paid: 'Payé',
  unpaid: 'Impayé',
  partial: 'Partiel',
}

export function Finance() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [filter, setFilter] = useState<'' | InvoiceStatus>('')
  const [loading, setLoading] = useState(true)
  const [relancing, setRelancing] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '50' })
    if (filter) params.set('statut', filter)
    Promise.all([
      fetch(`${BASE}/api/v1/finance/invoices?${params}`, { headers: authHeader() }).then((r) => r.json()),
      fetch(`${BASE}/api/v1/finance/summary`, { headers: authHeader() }).then((r) => r.json()),
    ])
      .then(([inv, sum]) => {
        setInvoices((inv as { data: Invoice[] }).data ?? [])
        setSummary(sum as FinanceSummary)
      })
      .catch(() => { setInvoices([]); setSummary(null) })
      .finally(() => setLoading(false))
  }, [filter])

  async function relancer(invoiceId: string) {
    setRelancing(invoiceId)
    await fetch(`${BASE}/api/v1/finance/invoices/${invoiceId}/relance`, {
      method: 'POST',
      headers: authHeader(),
    }).catch(() => null)
    setRelancing(null)
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Finance</h1>

      {summary && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <StatCard label="Total facturé" value={`${summary.total_facture.toLocaleString()} MAD`} color="blue" />
          <StatCard label="Total payé" value={`${summary.total_paye.toLocaleString()} MAD`} color="green" />
          <StatCard
            label="Taux recouvrement"
            value={`${summary.taux_recouvrement}%`}
            color={summary.taux_recouvrement >= 80 ? 'green' : summary.taux_recouvrement >= 60 ? 'yellow' : 'red'}
          />
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {(['', 'unpaid', 'partial', 'paid'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${filter === s ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`}
          >
            {s === '' ? 'Tous' : statusLabel[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-12">Chargement…</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Élève', 'Montant', 'Payé', 'Statut', 'Échéance', 'Action'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{inv.eleve_prenom} {inv.eleve_nom}</td>
                  <td className="px-4 py-3">{inv.montant.toLocaleString()} MAD</td>
                  <td className="px-4 py-3 text-gray-500">{inv.montant_paye.toLocaleString()} MAD</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle[inv.statut]}`}>
                      {statusLabel[inv.statut]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{inv.echeance}</td>
                  <td className="px-4 py-3">
                    {inv.statut !== 'paid' && (
                      <button
                        onClick={() => relancer(inv.id)}
                        disabled={relancing === inv.id}
                        className="text-xs px-3 py-1 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg border border-orange-200 disabled:opacity-50 transition-colors"
                      >
                        {relancing === inv.id ? '…' : 'Relancer'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Aucune facture</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

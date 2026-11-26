import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, handleCallback, isAuthenticated } from '../services/api'

export function Login() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isAuthenticated()) { navigate('/dashboard', { replace: true }); return }

    const params = new URLSearchParams(window.location.search)
    if (params.get('code')) {
      setLoading(true)
      handleCallback()
        .then((ok) => {
          if (ok) navigate('/dashboard', { replace: true })
          else setError('Échec de l\'authentification. Veuillez réessayer.')
        })
        .catch(() => setError('Erreur réseau.'))
        .finally(() => setLoading(false))
    }
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-sm text-center">
        <div className="mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">E</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">ERP Scolaire 360°</h1>
          <p className="text-gray-500 text-sm mt-1">Plateforme de gestion scolaire</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={() => { setLoading(true); login() }}
          disabled={loading}
          className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold rounded-xl transition-colors"
        >
          {loading ? 'Connexion en cours…' : 'Se connecter'}
        </button>

        <p className="mt-6 text-xs text-gray-400">
          Authentification sécurisée via Keycloak (PKCE)
        </p>
      </div>
    </div>
  )
}

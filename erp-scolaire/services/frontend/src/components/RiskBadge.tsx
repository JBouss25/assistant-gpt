interface Props { level: 'FAIBLE' | 'MOYEN' | 'ELEVE'; score: number }

const styles = {
  FAIBLE: 'bg-green-100 text-green-800',
  MOYEN:  'bg-yellow-100 text-yellow-800',
  ELEVE:  'bg-red-100 text-red-800',
}

export function RiskBadge({ level, score }: Props) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[level]}`}>
      {level} ({Math.round(score * 100)}%)
    </span>
  )
}

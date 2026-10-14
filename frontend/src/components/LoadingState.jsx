export default function LoadingState({ label = 'Loading charging stations…' }) {
  return (
    <div className="d-flex align-items-center justify-content-center gap-3 py-5" role="status">
      <span className="spinner-border text-success" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function getErrorMessage(error) {
  const status = error.response?.status
  if (status === 401) return 'Your session has expired or you are not signed in. Please sign in and try again.'
  if (status === 403) return 'Your account does not have permission to do that.'
  return error.response?.data?.message || error.message || 'Something went wrong. Please try again.'
}

export default function ErrorAlert({ error, onRetry }) {
  if (!error) return null

  return (
    <div className="alert alert-danger d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">
      <span>{typeof error === 'string' ? error : getErrorMessage(error)}</span>
      {onRetry && (
        <button className="btn btn-outline-danger btn-sm" type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

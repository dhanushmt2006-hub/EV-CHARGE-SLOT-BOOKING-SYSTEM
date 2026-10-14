const jwt = require('jsonwebtoken')

function authenticateToken(request, response, next) {
  const authorization = request.get('authorization')
  const [scheme, token] = authorization ? authorization.split(' ') : []

  if (scheme !== 'Bearer' || !token || authorization.split(' ').length !== 2) {
    return response.status(401).json({ message: 'Authentication token is required.' })
  }

  if (!process.env.JWT_SECRET) {
    return response.status(500).json({ message: 'Authentication is not configured.' })
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    if (!payload.sub || !['customer', 'admin'].includes(payload.role)) {
      return response.status(401).json({ message: 'Invalid or expired authentication token.' })
    }

    request.user = { id: payload.sub, role: payload.role }
    return next()
  } catch (_error) {
    return response.status(401).json({ message: 'Invalid or expired authentication token.' })
  }
}

function authorizeRoles(...allowedRoles) {
  return (request, response, next) => {
    if (!request.user || !allowedRoles.includes(request.user.role)) {
      return response.status(403).json({ message: 'You are not authorized to access this resource.' })
    }

    return next()
  }
}

module.exports = { authenticateToken, authorizeRoles }

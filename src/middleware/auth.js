const jwt = require('jsonwebtoken');

function signToken(user, secret) {
  return jwt.sign({ sub: String(user.id) }, secret, { expiresIn: '30d' });
}

// Checks the "Authorization: Bearer <token>" header and sets req.userId.
function requireAuth(secret) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const [type, token] = header.split(' ');
    if (type !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Please log in first.' });
    }
    try {
      const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
      req.userId = Number(payload.sub);
      return next();
    } catch {
      return res.status(401).json({ error: 'Your login has expired. Please log in again.' });
    }
  };
}

module.exports = { signToken, requireAuth };

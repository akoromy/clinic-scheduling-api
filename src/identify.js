const { unauthenticated } = require('./errors');

// Middleware to identify user from X-User-Id header and attach to req.user
function identify(db) {
  const findUser = db.prepare('SELECT id, name, role, team_id AS teamId FROM users WHERE id = ?'); 
  return (req, res, next) => { 
    const userId = req.get('X-User-Id'); // Get user ID from header
    if (!userId) return next(unauthenticated('Missing X-User-Id header'));
    const user = findUser.get(userId); // Get user from database
    if (!user) return next(unauthenticated('Unknown user'));
    req.user = user; // Attach user to request object
    next();
  };
}
// Returns true if user is an admin
const isAdmin = (user) => user.role === 'ADMIN';

module.exports = { identify, isAdmin };
import jwt from 'jsonwebtoken';
import { liveDataSource, testDataSource, dbContext } from '../db/index.js';

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  req.admin = decoded;

  // Route this admin's DB work to the live (public) schema or, for the test
  // admin, the isolated `test` schema. Tokens issued before the test feature
  // have no `mode` and default to live. The chosen DataSource is bound to the
  // request via AsyncLocalStorage so every service call resolves to it.
  const ds = decoded.mode === 'test' ? testDataSource : liveDataSource;
  try {
    if (!ds.isInitialized) await ds.initialize();
  } catch (err) {
    console.error('DB init error (auth):', err);
    return res.status(500).json({ error: 'Database connection failed' });
  }
  dbContext.run(ds, () => next());
}

export default authMiddleware;

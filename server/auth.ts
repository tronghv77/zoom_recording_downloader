import { Router, Request, Response, NextFunction } from 'express';
import session from 'express-session';

// Default credentials — change via environment variables
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'zoomdl2026';
const SESSION_SECRET = process.env.SESSION_SECRET || 'zoom-dl-session-secret-2026';

// Session middleware
export const sessionMiddleware = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
  },
});

// Auth check middleware — skip for login route and static files
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Skip auth for login API
  if (req.path === '/api/auth/login' || req.path === '/api/auth/status') {
    next();
    return;
  }

  // Skip auth for static files (CSS, JS, HTML)
  if (!req.path.startsWith('/api/')) {
    next();
    return;
  }

  // Check session
  if ((req.session as any)?.authenticated) {
    next();
    return;
  }

  res.status(401).json({ success: false, error: 'Not authenticated' });
}

// Auth routes
export function createAuthRouter(): Router {
  const router = Router();

  router.post('/login', (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      (req.session as any).authenticated = true;
      (req.session as any).username = username;
      res.json({ success: true, data: { username } });
    } else {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
  });

  router.post('/logout', (req: Request, res: Response) => {
    req.session.destroy(() => {});
    res.json({ success: true, data: null });
  });

  router.get('/status', (req: Request, res: Response) => {
    const authenticated = !!(req.session as any)?.authenticated;
    res.json({
      success: true,
      data: {
        authenticated,
        username: authenticated ? (req.session as any).username : null,
      },
    });
  });

  return router;
}

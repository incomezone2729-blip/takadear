import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decryptSensitiveData,
  encryptSensitiveData,
  signTransactionPayload,
} from './src/server/crypto.ts';
import {
  verifyFirebaseIdToken,
  type VerifiedFirebaseToken,
} from './src/server/firebaseAuthVerify.ts';
import {
  ADMIN_ONLY_TELEGRAM_EVENTS,
  sendTelegramNotification,
  validateTelegramNotificationBody,
  type TelegramNotificationPayload,
} from './src/server/telegram.ts';
import {
  apiErrorHandler,
  apiNotFoundHandler,
  asyncHandler,
  buildCorsMiddleware,
  safeBodyObject,
} from './src/server/httpHelpers.ts';
import {
  isAdminEmail,
  maskEmail,
  maskPhoneNumber,
  MIN_WITHDRAW,
  STREAK_BONUS,
} from './src/utils/takadearLogic.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  messagingSenderId: string;
}

const firebaseConfig: FirebaseAppletConfig = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'firebase-applet-config.json'), 'utf8')
);

interface AuthenticatedRequest extends Request {
  firebaseUser?: VerifiedFirebaseToken;
  rawToken?: string;
}

function checkCallerIsAdmin(user: VerifiedFirebaseToken): boolean {
  return Boolean(user.emailVerified && isAdminEmail(user.email));
}

async function requireFirebaseAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization Bearer token required' });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Empty Bearer token' });
    return;
  }

  try {
    const decoded = await verifyFirebaseIdToken(token, firebaseConfig.projectId);
    req.firebaseUser = decoded;
    req.rawToken = token;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid Firebase token';
    res.status(401).json({ error: message });
  }
}

async function createServer() {
  const app = express();
  app.set('trust proxy', 1);

  // CORS & security headers for API responses (handles Render split-origin and OPTIONS preflight cleanly)
  app.use('/api', (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use('/api', buildCorsMiddleware());
  app.use(express.json({ limit: '128kb' }));

  // 1. Minimal public health endpoint (internal Firebase IDs & crypto config stay admin-only)
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: Date.now(),
    });
  });

  // 2. Verify Firebase ID token & return verified session / admin status
  app.post('/api/auth/session', requireFirebaseAuth, (req: AuthenticatedRequest, res) => {
    const user = req.firebaseUser!;
    const admin = checkCallerIsAdmin(user);
    res.json({
      verified: true,
      uid: user.uid,
      emailMasked: user.email ? maskEmail(user.email) : null,
      emailVerified: user.emailVerified,
      isAdmin: admin,
      expiresAt: user.expiresAt,
    });
  });

  // 3. AES-256-GCM encryption endpoint for PII, wallet numbers, & account submissions
  app.post(
    '/api/secure/encrypt',
    requireFirebaseAuth,
    asyncHandler((req: AuthenticatedRequest, res) => {
      const user = req.firebaseUser!;
      const body = safeBodyObject(req.body);
      const type = typeof body.type === 'string' ? body.type : undefined;
      const value = body.value;

      if (!value || typeof value !== 'string' || value.trim().length < 3 || value.length > 1024) {
        res.status(400).json({ error: 'Invalid input value for encryption' });
        return;
      }

      const trimmed = value.trim();
      const encrypted = encryptSensitiveData(trimmed);
      const masked =
        type === 'email'
          ? maskEmail(trimmed)
          : type === 'wallet_number' || type === 'phone'
            ? maskPhoneNumber(trimmed)
            : '***';

      res.json({
        uid: user.uid,
        encrypted: encrypted.packed,
        masked,
        algorithm: encrypted.algorithm,
        keyVersion: encrypted.keyVersion,
      });
    })
  );

  // 4. Authorized AES-256-GCM decryption endpoint (owner or verified admin only)
  app.post(
    '/api/secure/decrypt',
    requireFirebaseAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const user = req.firebaseUser!;
      const body = safeBodyObject(req.body);
      const encrypted = body.encrypted;
      const ownerUid = typeof body.ownerUid === 'string' ? body.ownerUid : undefined;

      if (!encrypted || typeof encrypted !== 'string') {
        res.status(400).json({ error: 'Encrypted payload is required' });
        return;
      }

      const callerIsOwner = Boolean(ownerUid && ownerUid === user.uid);
      const callerIsAdmin = callerIsOwner ? false : checkCallerIsAdmin(user);

      if (!callerIsAdmin && !callerIsOwner) {
        res.status(403).json({ error: 'Forbidden: authorized owner or verified admin required' });
        return;
      }

      try {
        const plaintext = decryptSensitiveData(encrypted);
        res.json({ plaintext });
      } catch {
        res.status(400).json({ error: 'Failed to decrypt or authenticate payload' });
      }
    })
  );

  // 4b. Admin-only batch AES-256-GCM decryption for user email lookup & details
  app.post(
    '/api/admin/decrypt-batch',
    requireFirebaseAuth,
    asyncHandler((req: AuthenticatedRequest, res) => {
      const user = req.firebaseUser!;
      if (!checkCallerIsAdmin(user)) {
        res.status(403).json({ error: 'Forbidden: verified admin required' });
        return;
      }

      const body = safeBodyObject(req.body);
      const items = body.items as Array<{ id?: unknown; encrypted?: unknown }> | undefined;
      if (!Array.isArray(items) || items.length > 350) {
        res.status(400).json({ error: 'Invalid batch items array' });
        return;
      }

      const results: Record<string, string | null> = {};
      for (const entry of items) {
        if (!entry || typeof entry.id !== 'string' || typeof entry.encrypted !== 'string') {
          continue;
        }
        const cleanId = entry.id.trim().slice(0, 128);
        if (!cleanId) continue;
        try {
          results[cleanId] = decryptSensitiveData(entry.encrypted);
        } catch {
          results[cleanId] = null;
        }
      }

      res.json({ results });
    })
  );

  // 5. Server-validated HMAC-SHA256 receipt signing for rewards, withdrawals, & account sales
  app.post(
    '/api/rewards/sign',
    requireFirebaseAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const user = req.firebaseUser!;
      const body = safeBodyObject(req.body);
      const action = typeof body.action === 'string' ? body.action : undefined;
      const amount = body.amount;
      const streakDay = body.streakDay;
      const method = typeof body.method === 'string' ? body.method : undefined;
      const platform = typeof body.platform === 'string' ? body.platform : undefined;

      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        res.status(400).json({ error: 'Invalid transaction amount' });
        return;
      }

      let valid = false;
      if (action === 'referral' && numericAmount >= 0.5 && numericAmount <= 100) {
        valid = true;
      } else if (action === 'referral_friend' && numericAmount >= 0.05 && numericAmount <= 100) {
        valid = true;
      } else if (
        action === 'checkin' &&
        typeof streakDay === 'number' &&
        streakDay >= 1 &&
        numericAmount === STREAK_BONUS[(streakDay - 1) % STREAK_BONUS.length]
      ) {
        valid = true;
      } else if (
        action === 'withdrawal' &&
        numericAmount >= MIN_WITHDRAW &&
        numericAmount <= 150000 &&
        method === 'bKash'
      ) {
        valid = true;
      } else if (
        action === 'account_submit' &&
        numericAmount >= 1 &&
        numericAmount <= 100000 &&
        (platform === 'gmail' || platform === 'facebook')
      ) {
        valid = true;
      } else if (
        (action === 'admin_adjust' || action === 'account_approve') &&
        checkCallerIsAdmin(user)
      ) {
        valid = numericAmount >= 0.05 && numericAmount <= 150000;
      }

      if (!valid) {
        res.status(400).json({ error: 'Reward or transaction amount failed server policy validation' });
        return;
      }

      const signed = signTransactionPayload({
        uid: user.uid,
        action,
        amount: numericAmount,
      });

      res.json(signed);
    })
  );

  // 6. Admin-only security audit summary
  app.get('/api/admin/security-status', requireFirebaseAuth, (req: AuthenticatedRequest, res) => {
    const user = req.firebaseUser!;
    if (!checkCallerIsAdmin(user)) {
      res.status(403).json({ error: 'Admin verification required' });
      return;
    }
    res.json({
      adminEmail: user.email,
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.firestoreDatabaseId,
      encryptionAlgorithm: 'AES-256-GCM',
      signatureAlgorithm: 'HMAC-SHA256',
      tokenVerification: 'RS256-X509',
      customKeyConfigured: Boolean(process.env.ENCRYPTION_SECRET),
      telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    });
  });

  // 7. Authenticated Telegram bot notification relay (keeps bot token & chat ID strictly server-side)
  app.post(
    '/api/notify/telegram',
    requireFirebaseAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const user = req.firebaseUser!;
      const validated = validateTelegramNotificationBody(safeBodyObject(req.body));
      if (!validated.ok) {
        res.status(400).json({ error: validated.error });
        return;
      }

      if (ADMIN_ONLY_TELEGRAM_EVENTS.has(validated.event.type) && !checkCallerIsAdmin(user)) {
        res.status(403).json({ error: 'Admin verification required for this notification event' });
        return;
      }

      const payload: TelegramNotificationPayload = {
        ...validated.event,
        uid: user.uid,
        emailMasked: user.email ? maskEmail(user.email) : null,
      };

      const result = await sendTelegramNotification(payload);
      res.json({
        ok: result.ok,
        skipped: result.skipped ?? false,
      });
    })
  );

  // Always return valid JSON for unknown /api/* routes & errors (never fall through to HTML SPA fallback)
  app.use('/api', apiNotFoundHandler);
  app.use('/api', apiErrorHandler);

  const publicDir = path.resolve(__dirname, 'public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    const distIndex = path.join(distDir, 'index.html');
    app.use(express.static(distDir));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) {
        apiNotFoundHandler(req, res);
        return;
      }
      if (!fs.existsSync(distIndex)) {
        res.status(503).send('Application build (dist/index.html) not found. Run npm run build first.');
        return;
      }
      res.sendFile(distIndex);
    });
  }

  app.use(apiErrorHandler);

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`TakaDear server listening on http://0.0.0.0:${port}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start TakaDear server:', err);
  process.exit(1);
});

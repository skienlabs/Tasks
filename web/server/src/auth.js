import { createRemoteJWKSet, decodeJwt, errors, jwtVerify } from 'jose';

// Public keys Google uses to sign Firebase Auth ID tokens.
const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

const ALLOWED_PROVIDERS = new Set(['google.com', 'password']);

export class AuthError extends Error {
  constructor(message, statusCode = 401) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Builds a function that turns a Firebase ID token into a user, following
 * https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
 * `keys` can be injected for tests; otherwise Google's JWKS is fetched and cached.
 */
export function createVerifier({ projectId, allowList = [], keys } = {}) {
  if (!projectId) {
    return async () => {
      throw new AuthError('Sign-in is not configured on this server', 503);
    };
  }
  const jwks = keys ?? createRemoteJWKSet(new URL(FIREBASE_JWKS_URL), { cacheMaxAge: 6 * 60 * 60 * 1000 });

  return async function verify(token) {
    let payload;
    try {
      ({ payload } = await jwtVerify(token, jwks, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
        algorithms: ['RS256'],
        clockTolerance: 60,
        requiredClaims: ['sub', 'iat', 'exp', 'auth_time'],
      }));
    } catch (err) {
      // Could not reach / read Google's signing keys: a temporary server problem, not a bad session.
      if (err instanceof errors.JWKSTimeout || err instanceof errors.JWKSInvalid || !(err instanceof errors.JOSEError)) {
        throw new AuthError('Sign-in check is temporarily unavailable. Please try again.', 503);
      }
      throw new AuthError('Invalid or expired session');
    }
    return userFromClaims(payload, allowList);
  };
}

function userFromClaims(payload, allowList) {
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) {
    throw new AuthError('Invalid session');
  }
  if (typeof payload.auth_time !== 'number' || payload.auth_time > now + 60) {
    throw new AuthError('Invalid session');
  }
  if (typeof payload.iat !== 'number' || payload.iat > now + 60) {
    throw new AuthError('Invalid session');
  }

  // Only the sign-in methods this app offers (blocks e.g. anonymous accounts).
  const provider = payload.firebase?.sign_in_provider;
  if (!ALLOWED_PROVIDERS.has(provider)) throw new AuthError('This sign-in method is not allowed', 403);

  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
  if (allowList.length && !isAllowed(email, true, allowList)) {
    throw new AuthError('This account is not allowed to use this app', 403);
  }
  if (allowList.length && payload.email_verified !== true) {
    throw new AuthError('Please verify your email address first (check your inbox), then sign in again', 403);
  }
  return {
    uid: payload.sub,
    email,
    name: typeof payload.name === 'string' ? payload.name : null,
    photo: typeof payload.picture === 'string' ? payload.picture : null,
    provider,
    emailVerified: payload.email_verified === true,
  };
}

function isAllowed(email, verified, allowList) {
  if (!email || !verified) return false;
  const domain = email.slice(email.lastIndexOf('@'));
  return allowList.includes(email) || allowList.includes(domain);
}

/**
 * Local development only: any request is "dev@localhost". A token "dev:<name>" signs in as
 * a second person, <name>@localhost (for trying teams with several people). Never enabled in
 * production.
 */
export function createDevVerifier() {
  return async (token) => {
    const m = /^dev:([a-z0-9]{1,20})$/.exec(token || '');
    if (m && m[1] !== 'dev') {
      const name = m[1];
      return {
        uid: `dev-${name}`, email: `${name}@localhost`, name: name[0].toUpperCase() + name.slice(1),
        photo: null, provider: 'password', emailVerified: true,
      };
    }
    return { uid: 'dev-user', email: 'dev@localhost', name: 'Developer', photo: null, provider: 'password', emailVerified: true };
  };
}

/**
 * Local testing against the Firebase Auth emulator only (its tokens are unsigned).
 * Never enabled in production; see config.js.
 */
export function createEmulatorVerifier({ projectId, allowList = [] }) {
  return async function verify(token) {
    let payload;
    try {
      payload = decodeJwt(token);
    } catch {
      throw new AuthError('Invalid session');
    }
    const now = Math.floor(Date.now() / 1000);
    if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}` || !(payload.exp > now)) {
      throw new AuthError('Invalid or expired session');
    }
    return userFromClaims(payload, allowList);
  };
}

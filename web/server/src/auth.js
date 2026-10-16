import { createRemoteJWKSet, jwtVerify } from 'jose';

// Public keys Google uses to sign Firebase Auth ID tokens.
const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

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
    } catch {
      throw new AuthError('Invalid or expired session');
    }
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) {
      throw new AuthError('Invalid session');
    }
    if (typeof payload.auth_time !== 'number' || payload.auth_time > now + 60) {
      throw new AuthError('Invalid session');
    }

    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
    if (allowList.length && !isAllowed(email, payload.email_verified === true, allowList)) {
      throw new AuthError('This Google account is not allowed to use this app', 403);
    }
    return {
      uid: payload.sub,
      email,
      name: typeof payload.name === 'string' ? payload.name : null,
      photo: typeof payload.picture === 'string' ? payload.picture : null,
    };
  };
}

function isAllowed(email, verified, allowList) {
  if (!email || !verified) return false;
  const domain = email.slice(email.lastIndexOf('@'));
  return allowList.includes(email) || allowList.includes(domain);
}

/** Local development only: any request is "dev@localhost". Never enabled in production. */
export function createDevVerifier() {
  return async () => ({ uid: 'dev-user', email: 'dev@localhost', name: 'Developer', photo: null });
}

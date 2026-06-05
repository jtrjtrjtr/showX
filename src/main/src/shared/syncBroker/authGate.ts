import type { PairingClaims } from 'showx-shared';

export interface PairingValidator {
  validate(token: string): Promise<PairingClaims | null>;
}

// Permissive validator for tests/dev; B001-011 swaps in real PairingStore.
export class PermissiveValidator implements PairingValidator {
  async validate(_token: string): Promise<PairingClaims> {
    return { deviceId: 'dev', roles: ['*'], tier: 'pro', expiresAt: Date.now() + 86_400_000 };
  }
}

export function extractToken(
  req: { headers: Record<string, string | string[] | undefined>; url?: string },
): string | null {
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7);
  if (req.url) {
    const url = new URL(req.url, 'http://x');
    const t = url.searchParams.get('token');
    if (t) return t;
  }
  return null;
}

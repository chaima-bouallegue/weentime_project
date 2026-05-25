import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { buildMfaDisablePayload, normalizeMfaTotpCode } from './profile.service';

describe('ProfileService MFA helpers', () => {
  it('builds the backend disable payload with password and code keys only', () => {
    expect(buildMfaDisablePayload('Admin123@', ' 487-703 ')).toEqual({
      password: 'Admin123@',
      code: '487703'
    });
  });

  it('normalizes pasted TOTP codes to exactly six digits when possible', () => {
    expect(normalizeMfaTotpCode(' 487 703 ')).toBe('487703');
    expect(normalizeMfaTotpCode('487.703')).toBe('487703');
    expect(normalizeMfaTotpCode('(487) 703')).toBe('487703');
  });
});

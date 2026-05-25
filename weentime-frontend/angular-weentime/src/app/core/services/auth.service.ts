import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, switchMap, map, of } from 'rxjs';
import { Router } from '@angular/router';
import { ApiConfigService } from './api-config.service';

/**
 * Storage choice: localStorage
 *
 * Rationale: localStorage is used instead of sessionStorage because the app
 * requires multi-tab persistence — a user opening a new tab should stay
 * authenticated. The XSS risk is mitigated by:
 *   1. HTTP interceptor auto-logout on 401
 *   2. Inactivity timeout (15 min) with automatic token cleanup
 *   3. No sensitive data beyond the JWT stored client-side
 *
 * If multi-tab persistence is not required in the future, switch to
 * sessionStorage by replacing all localStorage calls below.
 */

export interface User {
  id: number;
  email: string;
  nom?: string;
  prenom?: string;
  role?: string;
  roles: string[];
  entrepriseId?: number;
  equipe?: { id?: number; nom?: string } | null;
  equipeNom?: string;
  photo?: string;
  entreprise?: {
    id: number;
    nom: string;
  };
}

export interface LoginResponse {
  token?: string;
  type?: string;
  id?: number;
  userId?: number;
  email: string;
  entrepriseId?: number;
  roles?: string[];
  mfaRequired?: boolean;
  mfaToken?: string;
  message?: string;
  requires2FA: boolean;
  requiresTwoFactor?: boolean;
  tempToken?: string;
  temporaryToken?: string;
  availableMethods?: TwoFactorMethod[];
  maskedEmail?: string;
  maskedPhone?: string;
  user?: User;
}

export type TwoFactorMethod = 'TOTP';

interface ApiResponse<T> {
  success?: boolean;
  message?: string;
  data?: T;
  error?: unknown;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterResponse {
  token: string;
  userId: number;
  email: string;
  roles: string[];
  message: string;
}

export interface CompanyCodeValidationResponse {
  valid: boolean;
  enterpriseId?: number;
  enterpriseName?: string;
  status?: string;
  invitationCode?: string;
  reason?: string;
  message?: string;
  id?: number;
  nom?: string;
  secteur?: string;
  collaborateurs?: number;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private readonly apiConfig = inject(ApiConfigService);
  private readonly rolePriority = ['ADMIN', 'RH', 'MANAGER', 'EMPLOYEE'];
  private readonly mfaChallengeStorageKey = 'weentime_mfa_challenge';

  /** Single source of truth for authentication state */
  currentUser = signal<User | null>(null);
  isAuthenticated = signal<boolean>(false);

  constructor() {
    this.loadUserFromStorage();
  }

  login(credentials: LoginCredentials, rememberMe = true): Observable<LoginResponse> {
    const payload = {
      email: credentials.email.trim(),
      password: credentials.password,
      motDePasse: credentials.password
    };

    return this.http.post<ApiResponse<LoginResponse> | LoginResponse>(this.apiConfig.AUTH.LOGIN, payload).pipe(
      map(response => this.unwrap(response)),
      switchMap(res => {
        const requiresTwoFactor = !!(res.mfaRequired || res.requiresTwoFactor || res.requires2FA);
        if (!requiresTwoFactor && res.token) {
          return this.fetchProfileAndHandleSuccess(res, rememberMe);
        }
        if (requiresTwoFactor) {
          this.storeMfaChallenge(res, rememberMe);
        }
        return of(res);
      })
    );
  }

  verify2fa(code: string, temporaryToken: string, rememberMe?: boolean, method?: TwoFactorMethod): Observable<any> {
    return this.http.post<any>(this.apiConfig.AUTH.VERIFY_2FA, { code, mfaToken: temporaryToken }).pipe(
      map(response => this.unwrap(response)),
      switchMap(res => {
        if (res.token) {
          this.clearMfaChallenge();
          return this.fetchProfileAndHandleSuccess(res, rememberMe ?? true);
        }
        return of(res);
      })
    );
  }

  send2faCode(method: TwoFactorMethod, temporaryToken: string): Observable<void> {
    return of(void 0);
  }

  getMfaChallenge(): { mfaToken: string; rememberMe: boolean; email?: string } | null {
    try {
      const raw = sessionStorage.getItem(this.mfaChallengeStorageKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as { mfaToken?: string; rememberMe?: boolean; email?: string };
      return parsed.mfaToken
        ? { mfaToken: parsed.mfaToken, rememberMe: parsed.rememberMe !== false, email: parsed.email }
        : null;
    } catch {
      this.clearMfaChallenge();
      return null;
    }
  }

  clearMfaChallenge(): void {
    try {
      sessionStorage.removeItem(this.mfaChallengeStorageKey);
    } catch {
      // Ignore storage access failures.
    }
  }

  validateCompanyCode(code: string): Observable<CompanyCodeValidationResponse> {
    const normalizedCode = this.normalizeInvitationCode(code);
    return this.http.get<CompanyCodeValidationResponse>(
      this.apiConfig.ORGANISATION.VALIDATE_COMPANY_CODE(normalizedCode),
      { headers: { 'X-Skip-Error-Toast': 'true' } }
    );
  }

  register(userData: any): Observable<RegisterResponse> {
    return this.http.post<ApiResponse<RegisterResponse> | RegisterResponse>(this.apiConfig.AUTH.REGISTER, userData).pipe(
      map(response => this.unwrap(response)),
      switchMap(res => {
        if (res.token) {
          return this.fetchProfileAndHandleSuccess(res, true);
        }
        return of(res);
      })
    );
  }

  /**
   * Secure logout — clears all auth state and navigates to login.
   * Uses replaceUrl to prevent back-button access to protected pages.
   */
  logout(): void {
    // Clear all stored data
    this.clearStorage();

    // Reset all signals to initial state
    this.reset();

    // Navigate to login, replacing history to block back-button
    this.router.navigate(['/login'], { replaceUrl: true });
  }

  /**
   * Resets all internal state. Called by logout() and can be called
   * by other services that need to wipe auth state.
   */
  reset(): void {
    this.currentUser.set(null);
    this.isAuthenticated.set(false);
  }

  getToken(): string | null {
    return this.safeGetStorage('token');
  }

  clearAuthState(): void {
    this.clearStorage();
    this.reset();
  }

  hasRole(role: 'ADMIN' | 'RH' | 'MANAGER' | 'EMPLOYEE' | string): boolean {
    const target = this.toBusinessRole(role);
    if (!target) {
      return false;
    }
    const user = this.currentUser();
    return this.toBusinessRole(user?.role) === target
      || user?.roles?.some(item => this.toBusinessRole(item) === target) === true;
  }

  private fetchProfileAndHandleSuccess(res: any, rememberMe: boolean): Observable<any> {
    this.storeValue('token', res.token, rememberMe);
    return this.http.get<User>(this.apiConfig.USER.GET_PROFILE).pipe(
      map(profile => {
        res.user = profile;
        this.handleAuthSuccess(res, rememberMe);
        return res;
      }),
      catchError(() => {
        this.handleAuthSuccess(res, rememberMe);
        return of(res);
      })
    );
  }

  private handleAuthSuccess(res: any, rememberMe: boolean): void {
    this.storeValue('token', res.token, rememberMe);
    const profile = this.sanitizeProfile(res.user);
    const roles = this.normalizeRoles([profile.role, profile.roles, res.roles]);
    const primaryRole = this.resolvePrimaryRole(roles);
    const entrepriseId = profile.entrepriseId || profile.entreprise?.id || res.entrepriseId;
    const user: User = {
      ...profile,
      id: profile.id || res.id || res.userId,
      email: profile.email || res.email,
      roles,
      role: primaryRole,
      entrepriseId,
      entreprise: profile.entreprise || (entrepriseId ? { id: entrepriseId, nom: '' } : undefined)
    };
    this.storeValue('user', JSON.stringify(user), rememberMe);
    this.currentUser.set(user);
    this.isAuthenticated.set(true);
  }

  private loadUserFromStorage(): void {
    const token = this.safeGetStorage('token');
    const userData = this.safeGetStorage('user');
    if (token && userData) {
      try {
        this.currentUser.set(JSON.parse(userData));
        this.isAuthenticated.set(true);
      } catch {
        this.clearStorage();
      }
    }
  }

  private clearStorage(): void {
    this.safeRemoveStorage('token');
    this.safeRemoveStorage('user');
    this.clearMfaChallenge();
  }

  private storeMfaChallenge(res: LoginResponse, rememberMe: boolean): void {
    const mfaToken = res.mfaToken ?? res.temporaryToken ?? res.tempToken;
    if (!mfaToken) {
      return;
    }
    try {
      sessionStorage.setItem(this.mfaChallengeStorageKey, JSON.stringify({
        mfaToken,
        rememberMe,
        email: res.email
      }));
    } catch {
      // Navigation state still carries the challenge when sessionStorage is unavailable.
    }
  }

  private storeValue(key: string, value: string, rememberMe: boolean): void {
    const persistentStorage = this.resolveStorage(rememberMe);
    const transientStorage = this.resolveStorage(!rememberMe);

    transientStorage?.removeItem(key);
    persistentStorage?.setItem(key, value);
  }

  private safeGetStorage(key: string): string | null {
    return this.resolveStorage(true)?.getItem(key)
      ?? this.resolveStorage(false)?.getItem(key)
      ?? null;
  }

  private safeRemoveStorage(key: string): void {
    this.resolveStorage(true)?.removeItem(key);
    this.resolveStorage(false)?.removeItem(key);
  }

  private resolveStorage(persistent: boolean): Storage | null {
    try {
      return persistent ? localStorage : sessionStorage;
    } catch {
      return null;
    }
  }

  private unwrap<T>(response: ApiResponse<T> | T): T {
    if (response && typeof response === 'object' && 'data' in (response as ApiResponse<T>)) {
      return (response as ApiResponse<T>).data as T;
    }
    return response as T;
  }

  private normalizeRoles(input: unknown): string[] {
    const businessRoles = this.extractRoleCandidates(input)
      .map(value => this.toBusinessRole(value))
      .filter((value): value is string => !!value);

    const primaryRole = this.resolvePrimaryRole(businessRoles);
    return primaryRole ? [primaryRole] : [];
  }

  private resolvePrimaryRole(roles: string[]): string | undefined {
    const normalizedRoles = new Set(
      roles
        .map(role => this.toBusinessRole(role))
        .filter((role): role is string => !!role)
    );

    return this.rolePriority.find(role => normalizedRoles.has(role));
  }

  private toBusinessRole(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim().toUpperCase();
    if (!normalized) {
      return null;
    }

    const withoutPrefix = normalized.startsWith('ROLE_')
      ? normalized.substring('ROLE_'.length)
      : normalized;

    return ['ADMIN', 'RH', 'MANAGER', 'EMPLOYEE'].includes(withoutPrefix)
      ? withoutPrefix
      : null;
  }

  private sanitizeProfile(source: unknown): Partial<User> {
    const profile = (source ?? {}) as Record<string, unknown>;
    const entreprise = this.toRecord(profile['entreprise']);
    const equipe = this.toRecord(profile['equipe']);
    const entrepriseId = this.toOptionalNumber(profile['entrepriseId'] ?? entreprise?.['id']);
    const equipeId = this.toOptionalNumber(equipe?.['id']);
    const equipeNom = this.toOptionalString(profile['equipeNom']) ?? this.toOptionalString(equipe?.['nom']);
    const entrepriseNom = this.toOptionalString(entreprise?.['nom']) ?? '';

    return {
      id: this.toOptionalNumber(profile['id']),
      email: this.toOptionalString(profile['email']) ?? '',
      nom: this.toOptionalString(profile['nom']) ?? undefined,
      prenom: this.toOptionalString(profile['prenom']) ?? undefined,
      role: this.toOptionalString(profile['role']) ?? undefined,
      roles: this.normalizeRoles([profile['role'], profile['roles']]),
      entrepriseId,
      equipe: equipeId || equipeNom ? { id: equipeId, nom: equipeNom } : null,
      equipeNom: equipeNom ?? undefined,
      photo: this.toOptionalString(profile['photo']) ?? undefined,
      entreprise: entrepriseId ? { id: entrepriseId, nom: entrepriseNom } : undefined
    };
  }

  private toOptionalNumber(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private toOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
  }

  private extractRoleCandidates(input: unknown): unknown[] {
    const values = Array.isArray(input) ? input : [input];
    return values.flatMap(value => {
      if (Array.isArray(value)) {
        return this.extractRoleCandidates(value);
      }
      if (typeof value === 'string') {
        return [value];
      }
      const record = this.toRecord(value);
      return record ? [record['nom'], record['name'], record['authority'], record['role']] : [];
    });
  }

  private normalizeInvitationCode(value: unknown): string {
    const normalized = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
    const withoutHash = normalized.replace(/^#+/, '');
    return withoutHash.startsWith('N-') ? `WEEN-${withoutHash.substring(2)}` : withoutHash;
  }
}

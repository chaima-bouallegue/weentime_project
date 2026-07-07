import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable, catchError, finalize, switchMap, map, of, tap, EMPTY } from 'rxjs';
import { Router } from '@angular/router';
import { ApiConfigService } from './api-config.service';
import { SKIP_ERROR_TOAST } from '../http/request-context.tokens';
import { environment } from '../../../environments/environment';


/**
 * Auth state is maintained via an HttpOnly cookie set by the backend.
 * The frontend never stores the JWT — it relies on the browser sending
 * the cookie automatically with each request.
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
    this.checkAuthStatus();
  }

  /**
   * Check if user is authenticated via the HttpOnly cookie by calling /auth/me.
   * Called once at app startup.
   */
  checkAuthStatus(): void {
    this.http.get<ApiResponse<any>>(this.apiConfig.AUTH.ME, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true)
    }).pipe(
      map(response => this.unwrap(response)),
      catchError(() => {
        this.reset();
        return of(null);
      })
    ).subscribe(data => {
      if (data && data.id) {
        const roles = this.normalizeRoles([data.roles]);
        const user: User = {
          id: data.id,
          email: data.email || '',
          entrepriseId: data.entrepriseId,
          roles,
          role: this.resolvePrimaryRole(roles)
        };
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
      } else {
        this.reset();
      }
    });
  }

  login(credentials: LoginCredentials, rememberMe = true): Observable<LoginResponse> {
    const payload = {
      email: credentials.email.trim(),
      password: credentials.password,
      motDePasse: credentials.password
    };

    this.startPerf('login_api');
    return this.http.post<ApiResponse<LoginResponse> | LoginResponse>(this.apiConfig.AUTH.LOGIN, payload, {
      withCredentials: true
    }).pipe(
      tap({
        next: () => this.endPerf('login_api'),
        error: () => this.endPerf('login_api')
      }),
      map(response => this.unwrap(response)),
      switchMap(res => {
        const requiresTwoFactor = !!(res.mfaRequired || res.requiresTwoFactor || res.requires2FA);
        if (!requiresTwoFactor) {
          return this.fetchProfileAfterAuth(rememberMe);
        }
        if (requiresTwoFactor) {
          this.storeMfaChallenge(res, rememberMe);
        }
        return of(res);
      })
    );
  }

  verify2fa(code: string, temporaryToken: string, rememberMe?: boolean, method?: TwoFactorMethod): Observable<any> {
    this.startPerf('mfa_verify_api');
    return this.http.post<any>(this.apiConfig.AUTH.VERIFY_2FA, { code, mfaToken: temporaryToken }, {
      withCredentials: true
    }).pipe(
      tap({
        next: () => this.endPerf('mfa_verify_api'),
        error: () => this.endPerf('mfa_verify_api')
      }),
      map(response => this.unwrap(response)),
      switchMap(() => {
        this.clearMfaChallenge();
        return this.fetchProfileAfterAuth(rememberMe ?? true);
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
    return this.http.post<ApiResponse<RegisterResponse> | RegisterResponse>(this.apiConfig.AUTH.REGISTER, userData, {
      withCredentials: true
    }).pipe(
      map(response => this.unwrap(response)),
      switchMap(res => {
        if (res.userId) {
          return this.fetchProfileAfterAuth(true);
        }
        return of(res);
      })
    );
  }

  /**
   * Secure logout — clears auth state on server (cookie destruction)
   * and navigates to login.
   */
  logout(): void {
    this.http.post(this.apiConfig.AUTH.LOGOUT, {}, { withCredentials: true }).pipe(
      catchError(() => of(null))
    ).subscribe(() => {
      this.reset();
      this.router.navigate(['/login'], { replaceUrl: true });
    });
  }

  /**
   * Fetches a short-lived WebSocket token (5 min) from the backend.
   * Never stored in localStorage — kept in memory only.
   */
  fetchWsToken(): Observable<string> {
    if (!this.currentUser()) {
      console.debug('[auth] fetchWsToken() skipped: profile not loaded yet');
      return EMPTY;
    }
    return this.http.get<{ wsToken: string }>(
      this.apiConfig.AUTH.WS_TOKEN,
      { withCredentials: true }
    ).pipe(map(r => r.wsToken));
  }

  /**
   * Attempts to refresh the JWT using the HttpOnly refresh_token cookie.
   * The backend rotates both JWT and refresh token on success.
   */
  refreshToken(): Observable<boolean> {
    return this.http.post<any>(this.apiConfig.AUTH.REFRESH, {}, {
      withCredentials: true,
      context: new HttpContext().set(SKIP_ERROR_TOAST, true)
    }).pipe(
      map(response => {
        const data = this.unwrap(response);
        if (data && data.userId) {
          const roles = this.normalizeRoles([data.roles]);
          const user: User = {
            id: data.userId,
            email: data.email || '',
            entrepriseId: data.entrepriseId,
            roles,
            role: this.resolvePrimaryRole(roles)
          };
          this.currentUser.set(user);
          this.isAuthenticated.set(true);
          return true;
        }
        return false;
      }),
      catchError(() => {
        this.reset();
        return of(false);
      })
    );
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
    return null;
  }

  clearAuthState(): void {
    this.reset();
  }

  refreshCurrentUserInBackground(rememberMe = true, label = 'post_login_background_load'): void {
    this.startPerf(label);
    this.http.get<User>(this.apiConfig.USER.GET_PROFILE, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true)
    }).pipe(
      catchError(error => {
        this.logDev('Background profile refresh failed', {
          status: error?.status,
          message: error?.message
        });
        return of(null);
      }),
      finalize(() => this.endPerf(label))
    ).subscribe(profile => {
      if (profile) {
        this.mergeProfileIntoCurrentUser(profile);
      }
    });
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

  private fetchProfileAfterAuth(rememberMe: boolean): Observable<any> {
    return this.http.get<User>(this.apiConfig.USER.GET_PROFILE).pipe(
      map(profile => {
        const user = this.buildUserFromProfile(profile);
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
        return { user, roles: user.roles };
      }),
      catchError(() => {
        const user: User = {
          id: 0,
          email: '',
          roles: [],
          role: undefined
        };
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
        return of({ user, roles: [] });
      })
    );
  }

  private buildUserFromProfile(profile: any): User {
    const normalized = this.sanitizeProfile(profile);
    const roles = this.normalizeRoles([normalized.role, normalized.roles]);
    const primaryRole = this.resolvePrimaryRole(roles);
    return {
      ...normalized,
      id: normalized.id ?? 0,
      email: normalized.email ?? '',
      roles,
      role: primaryRole,
      entrepriseId: normalized.entrepriseId ?? normalized.entreprise?.id,
      entreprise: normalized.entreprise ?? (normalized.entrepriseId ? { id: normalized.entrepriseId, nom: '' } : undefined)
    };
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

  private mergeProfileIntoCurrentUser(profile: User, rememberMe?: boolean): void {
    const current = this.currentUser();
    const normalized = this.sanitizeProfile(profile);
    const roles = this.normalizeRoles([
      normalized.role,
      normalized.roles,
      current?.role,
      current?.roles
    ]);
    const resolvedRoles = roles.length > 0 ? roles : current?.roles ?? [];
    const primaryRole = this.resolvePrimaryRole(resolvedRoles) ?? current?.role;
    const entrepriseId = normalized.entrepriseId ?? normalized.entreprise?.id ?? current?.entrepriseId;
    const user: User = {
      ...(current ?? {}),
      ...normalized,
      id: normalized.id ?? current?.id ?? 0,
      email: normalized.email || current?.email || '',
      roles: resolvedRoles,
      role: primaryRole,
      entrepriseId,
      entreprise: normalized.entreprise ?? current?.entreprise ?? (entrepriseId ? { id: entrepriseId, nom: '' } : undefined)
    };

    this.currentUser.set(user);
    this.isAuthenticated.set(true);
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
    if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
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

  private startPerf(label: string): void {
    if (!environment.production) {
      console.time(`[auth] ${label}`);
    }
  }

  private endPerf(label: string): void {
    if (!environment.production) {
      console.timeEnd(`[auth] ${label}`);
    }
  }

  private logDev(message: string, details?: unknown): void {
    if (!environment.production) {
      console.debug(`[auth] ${message}`, details ?? '');
    }
  }
}

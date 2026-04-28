import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, EMPTY, switchMap, map, of } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

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
  id?: number;
  userId?: number;
  email: string;
  entrepriseId?: number;
  roles?: string[];
  requires2FA: boolean;
  tempToken?: string;
  user?: User;
}

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

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private readonly API_URL = `${environment.apiUrl}/auth`;

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

    return this.http.post<ApiResponse<LoginResponse> | LoginResponse>(`${this.API_URL}/login`, payload).pipe(
      map(response => this.unwrap(response)),
      switchMap(res => {
        if (!res.requires2FA && res.token) {
          return this.fetchProfileAndHandleSuccess(res, rememberMe);
        }
        return of(res);
      })
    );
  }

  verify2fa(code: string, tempToken: string, rememberMe?: boolean): Observable<any> {
    return this.http.post<any>(`${this.API_URL}/verify-2fa`, { code, tempToken }).pipe(
      map(response => this.unwrap(response)),
      switchMap(res => {
        if (res.token) {
          return this.fetchProfileAndHandleSuccess(res, rememberMe ?? true);
        }
        return of(res);
      })
    );
  }

  validateCompanyCode(code: string): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/organisations/entreprises/validate-code/${code}`);
  }

  register(userData: any): Observable<RegisterResponse> {
    return this.http.post<ApiResponse<RegisterResponse> | RegisterResponse>(`${this.API_URL}/register`, userData).pipe(
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
    // No backend token invalidation endpoint exists currently.
    // If one is added, uncomment and adapt the following:
    /*
    const token = this.getToken();
    if (token) {
      this.http.post(`${this.API_URL}/logout`, {}).pipe(
        catchError(() => EMPTY)
      ).subscribe();
    }
    */

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
    return this.currentUser()?.roles?.some(item => this.toBusinessRole(item) === target) ?? false;
  }

  private fetchProfileAndHandleSuccess(res: any, rememberMe: boolean): Observable<any> {
    this.storeValue('token', res.token, rememberMe);
    return this.http.get<User>(`${environment.apiUrl}/users/me`).pipe(
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
    const roles = this.normalizeRoles(profile.roles || res.roles || profile.role);
    const primaryRole = this.resolvePrimaryRole(roles);
    const entrepriseId = profile.entrepriseId || profile.entreprise?.id || res.entrepriseId;
    const user: User = {
      ...profile,
      id: profile.id || res.id || res.userId,
      email: profile.email || res.email,
      roles,
      role: profile.role || primaryRole || roles[0],
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
    const source = Array.isArray(input)
      ? input.map(role => typeof role === 'string' ? role : (role?.nom || role?.name || role?.authority))
      : typeof input === 'string' && input.length > 0
        ? [input]
        : [];

    const businessRoles = source
      .map(value => this.toBusinessRole(value))
      .filter((value): value is string => !!value);

    const uniqueBusinessRoles = Array.from(new Set(businessRoles));
    const authorityRoles = uniqueBusinessRoles.map(role => `ROLE_${role}`);

    // Keep ROLE_* first for backward compatibility, plus plain roles for normalized frontend checks.
    return [...authorityRoles, ...uniqueBusinessRoles];
  }

  private resolvePrimaryRole(roles: string[]): string | undefined {
    for (const role of roles) {
      const normalized = this.toBusinessRole(role);
      if (normalized) {
        return normalized;
      }
    }
    return undefined;
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
      roles: this.normalizeRoles(profile['roles'] ?? profile['role']),
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
}

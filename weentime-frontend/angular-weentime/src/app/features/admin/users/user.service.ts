import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, map, tap } from 'rxjs';
import { ApiConfigService } from '../../../core/services/api-config.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/request-context.tokens';

export type UserRole = 'ADMIN' | 'RH' | 'MANAGER' | 'EMPLOYEE';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface UserOption {
  id: number;
  name: string;
}

export interface UserListItem {
  id: number;
  name: string;
  email: string;
  role: UserRole | string;
  status: UserStatus | string;
  manager: UserOption | null;
  company: UserOption | null;
}

export interface UserPage {
  content: UserListItem[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface UserUpsertPayload {
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole | string;
  status: UserStatus | string;
  companyId: number;
  departmentId?: number | null;
  teamId?: number | null;
  managerId?: number | null;
  password?: string;
  phone?: string;
  position?: string;
}

interface ApiEnvelope<T> {
  data?: T;
  payload?: T;
  result?: T;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);
  private readonly silentContext = new HttpContext().set(SKIP_ERROR_TOAST, true);

  private readonly usersPageSubject = new BehaviorSubject<UserPage>({
    content: [],
    totalElements: 0,
    totalPages: 1,
    number: 0,
    size: 10
  });

  readonly usersPage$ = this.usersPageSubject.asObservable();

  getUsers(params?: {
    page?: number;
    size?: number;
    role?: string | null;
    status?: string | null;
    companyId?: number | null;
    search?: string | null;
  }): Observable<UserPage> {
    const page = Math.max(Number(params?.page ?? 0), 0);
    const size = Math.max(1, Math.min(Math.trunc(Number(params?.size ?? 10)), 100));

    let query = new HttpParams()
      .set('page', String(page))
      .set('size', String(size));

    if (params?.role) {
      query = query.set('role', String(params.role));
    }
    if (params?.status) {
      query = query.set('status', String(params.status));
    }
    if (params?.companyId != null) {
      query = query.set('companyId', String(params.companyId));
    }
    if (params?.search) {
      query = query.set('search', String(params.search).trim());
    }

    return this.http
      .get<unknown>(`${this.api.getApiBase()}/users`, {
        params: query,
        context: this.silentContext
      })
      .pipe(
        map(response => this.toPage(response, page, size)),
        tap(pageData => this.usersPageSubject.next(pageData))
      );
  }

  createUser(payload: UserUpsertPayload): Observable<UserListItem> {
    return this.http
      .post<unknown>(`${this.api.getApiBase()}/users`, payload)
      .pipe(map(response => this.normalizeUser(this.unwrap<UserListItem>(response))));
  }

  updateUser(id: number, payload: UserUpsertPayload): Observable<UserListItem> {
    return this.http
      .put<unknown>(`${this.api.getApiBase()}/users/${id}`, payload)
      .pipe(map(response => this.normalizeUser(this.unwrap<UserListItem>(response))));
  }

  deleteUser(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api.getApiBase()}/users/${id}`);
  }

  getRoles(): Observable<string[]> {
    return this.http
      .get<unknown>(`${this.api.getApiBase()}/users/roles`, { context: this.silentContext })
      .pipe(map(response => this.toStringList(response)));
  }

  getStatuses(): Observable<string[]> {
    return this.http
      .get<unknown>(`${this.api.getApiBase()}/users/statuses`, { context: this.silentContext })
      .pipe(map(response => this.toStringList(response)));
  }

  getCompanies(): Observable<UserOption[]> {
    return this.http
      .get<unknown>(`${this.api.getApiBase()}/users/companies`, { context: this.silentContext })
      .pipe(map(response => this.toOptionList(response)));
  }

  getDepartments(companyId?: number | null): Observable<UserOption[]> {
    let params = new HttpParams();
    if (companyId != null) {
      params = params.set('companyId', String(companyId));
    }
    return this.http
      .get<unknown>(`${this.api.getApiBase()}/users/departments`, { params, context: this.silentContext })
      .pipe(map(response => this.toOptionList(response)));
  }

  getTeams(departmentId?: number | null): Observable<UserOption[]> {
    let params = new HttpParams();
    if (departmentId != null) {
      params = params.set('departmentId', String(departmentId));
    }
    return this.http
      .get<unknown>(`${this.api.getApiBase()}/users/teams`, { params, context: this.silentContext })
      .pipe(map(response => this.toOptionList(response)));
  }

  getManagers(companyId?: number | null): Observable<UserOption[]> {
    let params = new HttpParams();
    if (companyId != null) {
      params = params.set('companyId', String(companyId));
    }
    return this.http
      .get<unknown>(`${this.api.getApiBase()}/users/managers`, { params, context: this.silentContext })
      .pipe(map(response => this.toOptionList(response)));
  }

  private unwrap<T>(source: unknown): T {
    if (source && typeof source === 'object') {
      const envelope = source as ApiEnvelope<T>;
      if (envelope.data !== undefined) {
        return envelope.data;
      }
      if (envelope.payload !== undefined) {
        return envelope.payload;
      }
      if (envelope.result !== undefined) {
        return envelope.result;
      }
    }
    return source as T;
  }

  private toPage(source: unknown, requestedPage: number, requestedSize: number): UserPage {
    const raw = this.unwrap<unknown>(source);
    if (Array.isArray(raw)) {
      const content = (raw as UserListItem[]).map(item => this.normalizeUser(item));
      return {
        content,
        totalElements: content.length,
        totalPages: content.length > 0 ? 1 : 0,
        number: requestedPage,
        size: requestedSize
      };
    }

    const page = raw as {
      content?: unknown;
      totalElements?: unknown;
      totalPages?: unknown;
      number?: unknown;
      size?: unknown;
    } | null;

    const content = Array.isArray(page?.content)
      ? (page.content as UserListItem[]).map(item => this.normalizeUser(item))
      : [];
    const totalElements = Number(page?.totalElements ?? content.length);
    const size = Number(page?.size ?? requestedSize);
    const totalPages = Number(page?.totalPages ?? (size > 0 ? Math.ceil(totalElements / size) : 0));
    const number = Number(page?.number ?? requestedPage);

    return {
      content,
      totalElements: Number.isFinite(totalElements) ? totalElements : content.length,
      totalPages: Number.isFinite(totalPages) ? totalPages : 0,
      number: Number.isFinite(number) ? number : requestedPage,
      size: Number.isFinite(size) ? size : requestedSize
    };
  }

  private toStringList(source: unknown): string[] {
    const raw = this.unwrap<unknown>(source);
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .map(item => {
        if (typeof item === 'string') {
          return item;
        }
        const value = item as { nom?: unknown; name?: unknown; role?: unknown } | null;
        return String(value?.nom ?? value?.name ?? value?.role ?? '').trim();
      })
      .filter(Boolean);
  }

  private toOptionList(source: unknown): UserOption[] {
    const raw = this.unwrap<unknown>(source);
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .map(item => {
        const value = item as { id?: unknown; name?: unknown } | null;
        const name = String(
          value?.name
          ?? (value as { nom?: unknown } | null)?.nom
          ?? (value as { label?: unknown } | null)?.label
          ?? ''
        ).trim();
        return {
          id: Number(value?.id ?? 0),
          name
        };
      })
      .filter(item => Number.isFinite(item.id) && item.id > 0 && item.name.length > 0);
  }

  private normalizeUser(source: UserListItem): UserListItem {
    const raw = (source ?? {}) as UserListItem & {
      fullName?: string;
      firstName?: string;
      lastName?: string;
      status?: string;
      managerId?: number;
      managerName?: string;
      companyId?: number;
      companyName?: string;
    };
    const name = String(raw.name ?? raw.fullName ?? `${raw.firstName ?? ''} ${raw.lastName ?? ''}`.trim() ?? raw.email ?? '').trim();
    return {
      ...raw,
      name,
      role: this.toBusinessRole(raw.role),
      status: this.toUserStatus(raw.status),
      manager: raw.manager ?? (raw.managerId ? { id: raw.managerId, name: raw.managerName ?? 'Non assigne' } : null),
      company: raw.company ?? (raw.companyId ? { id: raw.companyId, name: raw.companyName ?? '' } : null)
    };
  }

  private toBusinessRole(value: unknown): UserRole {
    const normalized = String(value ?? '').trim().toUpperCase().replace(/^ROLE_/, '');
    switch (normalized) {
      case 'ADMIN':
        return 'ADMIN';
      case 'RH':
        return 'RH';
      case 'MANAGER':
        return 'MANAGER';
      default:
        return 'EMPLOYEE';
    }
  }

  private toUserStatus(value: unknown): UserStatus {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (normalized === 'ACTIF' || normalized === 'ACTIVE') {
      return 'ACTIVE';
    }
    if (normalized === 'SUSPENDU' || normalized === 'SUSPENDED') {
      return 'SUSPENDED';
    }
    return 'INACTIVE';
  }
}

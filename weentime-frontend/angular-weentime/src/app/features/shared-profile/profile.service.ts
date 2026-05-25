import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ApiConfigService } from '../../core/services/api-config.service';

export interface UserProfile {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  poste?: string;
  departement?: { id: number; nom: string };
  entreprise?: { id: number; nom: string };
  photo?: string;
  statut: 'ACTIF' | 'INACTIF' | 'SUSPENDU';
  twoFactorEnabled: boolean;
  twoFactorType: string;
  dateCreation: string;
}

export interface UpdateProfileRequest {
  nom: string;
  prenom: string;
  telephone?: string;
  poste?: string;
  departementId?: number;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ActivityItem {
  id: number;
  action?: string;
  type: string;
  description: string;
  timestamp?: string;
  date: string;
  ipAddress?: string | null;
  icon: string;
}

export interface TwoFactorSetupResponse {
  secret: string;
  qrCodeUri?: string;
  qrCodeUrl?: string;
  otpauthUrl?: string;
  qrCodeBase64?: string;
  setupToken?: string;
}

export interface DisableMfaPayload {
  password: string;
  code: string;
}

export function normalizeMfaTotpCode(code?: string): string {
  return (code ?? '').replace(/\D/g, '').trim();
}

export function buildMfaDisablePayload(password?: string, code?: string): DisableMfaPayload {
  return {
    password: password ?? '',
    code: normalizeMfaTotpCode(code)
  };
}

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private apiConfig = inject(ApiConfigService);

  getProfile(): Observable<UserProfile> {
    return this.http.get<any>(this.apiConfig.USER.GET_PROFILE).pipe(
      map(res => ({
        id: res.id,
        nom: res.nom || '',
        prenom: res.prenom || '',
        email: res.email || '',
        telephone: res.telephone,
        poste: res.poste,
        departement: res.departement,
        entreprise: res.entreprise,
        photo: res.photo,
        statut: res.statut || 'ACTIF',
        twoFactorEnabled: res.twoFactorEnabled || false,
        twoFactorType: res.twoFactorType || 'NONE',
        dateCreation: res.dateCreation || new Date().toISOString()
      })),
      tap(profile => {
        const user = this.authService.currentUser();
        if (user) {
          const updatedUser = { 
            ...user, 
            nom: profile.nom, 
            prenom: profile.prenom,
            photo: profile.photo 
          };
          this.authService.currentUser.set(updatedUser);
          localStorage.setItem('user', JSON.stringify(updatedUser));
        }
      })
    );
  }

  updateProfile(data: UpdateProfileRequest): Observable<UserProfile> {
    return this.http.put<any>(this.apiConfig.USER.UPDATE_PROFILE, data).pipe(
      map(response => this.normalizeProfile(this.unwrap<any>(response))),
      tap(profile => {
        const user = this.authService.currentUser();
        if (user) {
          const updatedUser = {
            ...user,
            nom: profile.nom,
            prenom: profile.prenom,
            entreprise: profile.entreprise
          };
          this.authService.currentUser.set(updatedUser);
          localStorage.setItem('user', JSON.stringify(updatedUser));
        }
      })
    );
  }

  changePassword(data: ChangePasswordRequest): Observable<void> {
    return this.http.put<any>(this.apiConfig.USER.CHANGE_PASSWORD, data).pipe(
      map(() => void 0)
    );
  }

  updateProfilePhoto(photoBase64: string): Observable<void> {
    return this.http.patch<void>(this.apiConfig.USER.UPLOAD_AVATAR, photoBase64);
  }

  getActivityHistory(): Observable<ActivityItem[]> {
    return this.http.get<any>(this.apiConfig.USER.GET_ACTIVITY).pipe(
      map(response => {
        const rawItems = this.unwrap<any>(response);
        const items = Array.isArray(rawItems) ? rawItems : [];
        return items.map(item => ({
          id: Number(item?.id ?? 0),
          action: item?.action ?? item?.type ?? 'ACTIVITY',
          type: item?.type ?? item?.action ?? 'ACTIVITY',
          description: item?.description ?? '',
          timestamp: item?.timestamp ?? item?.date ?? null,
          date: item?.date ?? item?.timestamp ?? new Date().toISOString(),
          ipAddress: item?.ipAddress ?? null,
          icon: item?.icon ?? 'activity'
        } as ActivityItem));
      })
    );
  }

  setup2fa(type: 'TOTP' | 'AUTHENTICATOR' = 'TOTP'): Observable<TwoFactorSetupResponse> {
    return this.http.post<any>(this.apiConfig.AUTH.SETUP_TOTP_2FA, {}).pipe(
      map(response => this.unwrap<TwoFactorSetupResponse>(response))
    );
  }

  confirm2fa(
    type: 'TOTP' | 'AUTHENTICATOR',
    code: string
  ): Observable<{ message: string; backupCodes: string[] }> {
    return this.http.post<any>(this.apiConfig.AUTH.CONFIRM_TOTP_2FA, { code }).pipe(
      map(response => this.unwrap<{ message: string; backupCodes: string[] }>(response))
    );
  }

  disable2fa(password?: string, code?: string): Observable<void> {
    return this.http.post<any>(this.apiConfig.AUTH.DISABLE_2FA, buildMfaDisablePayload(password, code)).pipe(
      map(() => void 0)
    );
  }

  private unwrap<T>(response: any): T {
    return (response?.data ?? response) as T;
  }

  private normalizeProfile(response: any): UserProfile {
    return {
      id: response.id,
      nom: response.nom || '',
      prenom: response.prenom || '',
      email: response.email || '',
      telephone: response.telephone,
      poste: response.poste,
      departement: response.departement,
      entreprise: response.entreprise,
      photo: this.resolveAssetUrl(response.photo || response.avatarUrl),
      statut: response.statut || 'ACTIF',
      twoFactorEnabled: response.twoFactorEnabled || false,
      twoFactorType: response.twoFactorType || 'NONE',
      dateCreation: response.dateCreation || new Date().toISOString()
    };
  }

  private resolveAssetUrl(url?: string | null): string | undefined {
    if (!url) {
      return undefined;
    }
    if (/^https?:\/\//i.test(url) || url.startsWith('data:')) {
      return url;
    }

    const origin = this.apiConfig.getApiBase().replace(/\/api\/v1\/?$/, '');
    return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
  }
}

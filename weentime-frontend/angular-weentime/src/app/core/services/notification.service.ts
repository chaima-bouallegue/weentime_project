import { computed, effect, Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { EMPTY, Observable, Subscription, catchError, map, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { WebSocketService } from './websocket.service';
import { AuthService } from './auth.service';

export type NotificationType =
  | 'CONGE_SOUMIS'
  | 'CONGE_APPROUVE'
  | 'CONGE_REFUSE'
  | 'CONGE_VALIDATION_RH'
  | 'USER_PENDING'
  | 'ACCOUNT_ACTIVATED'
  | 'ACCOUNT_REJECTED'
  | 'RETARD_EMPLOYE'
  | 'RETARD_MEMBRE'
  | 'AUTO_CLOSE'
  | 'TELETRAVAIL_SOUMIS'
  | 'TELETRAVAIL_VALIDATION_RH'
  | 'TELETRAVAIL_APPROUVE'
  | 'TELETRAVAIL_REFUSE'
  | 'AUTORISATION_APPROUVEE'
  | string;

export type NotificationCategory = 'workflow' | 'presence' | 'account' | 'system';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';

export interface Notification {
  id: number | string;
  type: NotificationType;
  titre: string;
  message: string;
  date: Date;
  lu: boolean;
  tag?: string;
  route?: string;
  entityId?: number | string;
  entityType?: string;
  icone?: string;
  couleur?: string;
}

export interface RealtimeNotificationItem extends Notification {
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  read: boolean;
  relativeTime: string;
  actionUrl?: string;
}

export interface RealtimeNotificationView {
  id: number | string;
  title: string;
  message: string;
  actor: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  read: boolean;
  relativeTime: string;
  actionUrl?: string;
}

export interface WorkflowDigestPayload {
  pending?: number;
  approved?: number;
  rejected?: number;
  critical?: number;
  items?: Partial<Notification>[];
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly webSocket = inject(WebSocketService);
  private readonly authService = inject(AuthService);

  private readonly rhUrl = `${environment.apiUrl}/rh/notifications`;
  private readonly orgUrl = `${environment.apiUrl}/notifications`;
  private readonly _notifications = signal<Notification[]>([]);
  private readonly _loading = signal(false);
  private subscriptions = new Subscription();
  private connectedUserId: number | null = null;

  readonly loading = computed(() => this._loading());
  readonly notifications = computed(() =>
    [...this._notifications()].sort((a, b) => b.date.getTime() - a.date.getTime())
  );
  readonly items = computed<RealtimeNotificationItem[]>(() =>
    this.notifications().map(item => ({
      ...item,
      category: this.resolveCategory(item.type),
      priority: this.resolvePriority(item.type),
      title: item.titre,
      read: item.lu,
      relativeTime: this.relativeTime(item.date),
      actionUrl: item.route
    }))
  );
  readonly latest = computed(() => this.items()[0] ?? null);
  readonly workflowItems = computed(() => this.items().filter(item => item.category === 'workflow'));
  readonly unreadCount = computed(() => this.notifications().filter(item => !item.lu).length);
  readonly criticalCount = computed(() => this.items().filter(item => !item.lu && item.priority === 'critical').length);

  constructor() {
    effect(() => {
      const userId = this.authService.currentUser()?.id ?? null;
      const token = this.authService.getToken();

      if (!token || !userId) {
        this.resetRealtime();
        this._notifications.set([]);
        return;
      }

      this.getNotifications().subscribe();
    });
  }

  getNotifications(): Observable<Notification[]> {
    if (!this.authService.getToken()) {
      this._notifications.set([]);
      return of([]);
    }
    this._loading.set(true);
    return this.http.get<unknown>(`${this.rhUrl}/mes-notifications`).pipe(
      catchError(() => this.http.get<unknown>(this.orgUrl)),
      map(payload => this.extractCollection(payload).map(item => this.normalize(item))),
      tap(items => this._notifications.set(items)),
      catchError(() => {
        this._notifications.set([]);
        return of([]);
      }),
      tap(() => this._loading.set(false))
    );
  }

  getUnreadCount(): Observable<number> {
    return this.http.get<number | { unreadCount?: number }>(`${this.rhUrl}/non-lues/count`).pipe(
      catchError(() => this.http.get<{ unreadCount?: number }>(`${this.orgUrl}/unread-count`)),
      map(response => typeof response === 'number' ? response : Number(response?.unreadCount ?? 0)),
      catchError(() => of(this.unreadCount()))
    );
  }

  connectWebSocket(userId?: number): void {
    if (!userId || !this.authService.getToken() || this.connectedUserId === userId) {
      return;
    }
    this.resetRealtime();
    this.connectedUserId = userId;

    const orgEndpoint = environment.websocket?.notifications ?? `${environment.wsUrl}/ws/notifications`;
    const rhEndpoint = environment.websocket?.rh ?? `${environment.wsUrl}/ws-rh`;

    this.subscriptions.add(
      this.webSocket.watch<unknown>(`/topic/notifications/${userId}`, orgEndpoint)
        .pipe(catchError(() => EMPTY))
        .subscribe(payload => this.upsert(this.normalize(payload)))
    );
    this.subscriptions.add(
      this.webSocket.watch<unknown>(`/topic/user/${userId}`, orgEndpoint)
        .pipe(catchError(() => EMPTY))
        .subscribe(payload => this.upsert(this.normalize(payload)))
    );
    this.subscriptions.add(
      this.webSocket.watch<unknown>('/user/queue/notifications', rhEndpoint)
        .pipe(catchError(() => EMPTY))
        .subscribe(payload => this.upsert(this.normalize(payload)))
    );
  }

  private resetRealtime(): void {
    this.connectedUserId = null;
    this.subscriptions.unsubscribe();
    this.subscriptions = new Subscription();
  }

  markAsRead(id: number | string): Observable<void> {
    this._notifications.update(items => items.map(item => item.id === id ? { ...item, lu: true } : item));
    if (this.isLocalNotificationId(id)) {
      return of(void 0);
    }
    return this.http.patch<void>(`${this.rhUrl}/${id}/lire`, {}).pipe(
      catchError(() => this.http.patch<void>(`${this.orgUrl}/${id}/read`, {})),
      catchError(() => of(void 0))
    );
  }

  markAllAsRead(): void {
    this._notifications.update(items => items.map(item => ({ ...item, lu: true })));
    this.http.patch<void>(`${this.rhUrl}/tout-lire`, {}).pipe(
      catchError(() => this.http.patch<void>(`${this.orgUrl}/read-all`, {})),
      catchError(() => of(void 0))
    ).subscribe();
  }

  toggleRead(id: string): void {
    const notification = this.notifications().find(item => String(item.id) === id);
    if (!notification) {
      return;
    }
    if (notification.lu) {
      this._notifications.update(items => items.map(item => item.id === notification.id ? { ...item, lu: false } : item));
      return;
    }
    this.markAsRead(notification.id).subscribe();
  }

  dismiss(id: string): void {
    this._notifications.update(items => items.filter(item => String(item.id) !== id));
  }

  clearAll(): void {
    this._notifications.set([]);
    this.http.delete<void>(`${this.rhUrl}/tout-effacer`).pipe(catchError(() => of(void 0))).subscribe();
  }

  simulateNotification(): void {
    this.upsert({
      id: `local-${Date.now()}`,
      type: 'CONGE_VALIDATION_RH',
      titre: 'Notification de test',
      message: 'Le flux temps reel est pret.',
      date: new Date(),
      lu: false,
      tag: 'Workflow',
      route: '/app/notifications'
    });
  }

  navigateToNotification(notification: Notification): void {
    if (!notification.lu) {
      this.markAsRead(notification.id).subscribe();
    }
    void this.router.navigateByUrl(notification.route || this.defaultRoute(notification));
  }

  syncWorkflowDigest(scope: 'manager' | 'rh', payload: WorkflowDigestPayload): void {
    const created = (payload.items ?? []).map((item, index) => this.normalize({
      ...item,
      id: item.id ?? `${scope}-digest-${Date.now()}-${index}`,
      titre: item.titre ?? (scope === 'rh' ? 'Synthese RH' : 'Synthese manager'),
      message: item.message ?? `${payload.pending ?? 0} demandes en attente.`,
      type: item.type ?? 'CONGE_VALIDATION_RH',
      lu: false,
      date: new Date()
    }));
    created.forEach(item => this.upsert(item));
  }

  toView(item: RealtimeNotificationItem): RealtimeNotificationView {
    return {
      id: item.id,
      title: item.titre,
      message: item.message,
      actor: item.tag ?? item.entityType ?? 'WeenTime',
      category: item.category,
      priority: item.priority,
      read: item.lu,
      relativeTime: this.relativeTime(item.date),
      actionUrl: item.route
    };
  }

  private upsert(notification: Notification): void {
    this._notifications.update(items => {
      const index = items.findIndex(item => item.id === notification.id);
      if (index === -1) {
        return [notification, ...items];
      }
      const next = [...items];
      next[index] = { ...next[index], ...notification };
      return next;
    });
  }

  private normalize(source: unknown): Notification {
    const item = (source ?? {}) as Record<string, unknown>;
    const type = String(item['type'] ?? item['entityType'] ?? 'SYSTEM');
    const dateValue = item['date'] ?? item['dateCreation'] ?? item['createdAt'] ?? new Date();
    return {
      id: (item['id'] as number | string | undefined) ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
      titre: String(item['titre'] ?? item['title'] ?? this.titleFor(type)),
      message: String(item['message'] ?? ''),
      date: new Date(String(dateValue)),
      lu: Boolean(item['lu'] ?? item['isRead'] ?? false),
      tag: (item['tag'] as string | undefined) ?? this.tagFor(type),
      route: (item['route'] as string | undefined) ?? (item['actionUrl'] as string | undefined),
      entityId: item['entityId'] as number | string | undefined,
      entityType: item['entityType'] as string | undefined,
      icone: item['icone'] as string | undefined,
      couleur: item['couleur'] as string | undefined
    };
  }

  private extractCollection(payload: unknown): unknown[] {
    if (Array.isArray(payload)) {
      return payload;
    }

    if (payload && typeof payload === 'object') {
      const data = (payload as Record<string, unknown>)['data'];
      return Array.isArray(data) ? data : [];
    }

    return [];
  }

  private isLocalNotificationId(id: number | string): boolean {
    return typeof id === 'string' && id.startsWith('local-');
  }

  private resolveCategory(type: string): NotificationCategory {
    if (type.startsWith('RETARD') || type === 'AUTO_CLOSE') return 'presence';
    if (type.startsWith('USER') || type.startsWith('ACCOUNT')) return 'account';
    if (type.includes('CONGE') || type.includes('TELETRAVAIL') || type.includes('AUTORISATION')) return 'workflow';
    return 'system';
  }

  private resolvePriority(type: string): NotificationPriority {
    if (type.includes('REFUSE') || type.includes('REJECTED')) return 'critical';
    if (type.includes('VALIDATION') || type.includes('SOUMIS') || type.includes('PENDING')) return 'high';
    if (type.includes('APPROUVE') || type.includes('ACTIVATED')) return 'normal';
    return 'low';
  }

  private defaultRoute(notification: Notification): string {
    if (notification.type.includes('CONGE')) return '/app/rh/conges';
    if (notification.type.includes('TELETRAVAIL')) return '/app/rh/teletravail';
    if (notification.type.includes('RETARD')) return '/app/manager/presence';
    return '/app/notifications';
  }

  private titleFor(type: string): string {
    if (type.includes('CONGE')) return 'Conge';
    if (type.includes('TELETRAVAIL')) return 'Teletravail';
    if (type.includes('RETARD')) return 'Presence';
    return 'Notification';
  }

  private tagFor(type: string): string {
    if (type.includes('CONGE')) return 'Conges';
    if (type.includes('TELETRAVAIL')) return 'Teletravail';
    if (type.includes('RETARD')) return 'Presence';
    return 'Systeme';
  }

  private relativeTime(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.max(Math.floor(diffMs / 60000), 0);
    if (minutes < 1) return 'maintenant';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h`;
    return `${Math.floor(hours / 24)} j`;
  }
}

import { Injectable, inject } from '@angular/core';
import {
  NotificationService,
  type NotificationCategory,
  type NotificationPriority,
  type RealtimeNotificationItem,
  type RealtimeNotificationView,
  type WorkflowDigestPayload
} from './notification.service';

export type {
  NotificationCategory,
  NotificationPriority,
  RealtimeNotificationItem,
  RealtimeNotificationView,
  WorkflowDigestPayload
};

@Injectable({ providedIn: 'root' })
export class RealtimeNotificationService {
  private readonly notificationService = inject(NotificationService);

  readonly items = this.notificationService.items;
  readonly latest = this.notificationService.latest;
  readonly workflowItems = this.notificationService.workflowItems;
  readonly unreadCount = this.notificationService.unreadCount;
  readonly criticalCount = this.notificationService.criticalCount;
  readonly loading = this.notificationService.loading;

  getNotifications() {
    return this.notificationService.getNotifications();
  }

  getUnreadCount() {
    return this.notificationService.getUnreadCount();
  }

  connectWebSocket(userId?: number): void {
    this.notificationService.connectWebSocket(userId);
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead();
  }

  markAsRead(id: number | string) {
    return this.notificationService.markAsRead(id);
  }

  toggleRead(id: string): void {
    this.notificationService.toggleRead(id);
  }

  dismiss(id: string): void {
    this.notificationService.dismiss(id);
  }

  syncWorkflowDigest(scope: 'manager' | 'rh', payload: WorkflowDigestPayload): void {
    this.notificationService.syncWorkflowDigest(scope, payload);
  }
}

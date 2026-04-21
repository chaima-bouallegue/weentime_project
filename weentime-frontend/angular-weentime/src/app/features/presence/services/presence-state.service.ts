import { Injectable, inject, computed } from '@angular/core';
import { PresenceService } from './presence.service';

/**
 * PresenceStateService - Forwarding wrapper around PresenceService
 *
 * This service exists for backwards compatibility with components
 * that depend on the PresenceStateService interface.
 *
 * All actual logic is delegated to PresenceService.
 */
@Injectable({
  providedIn: 'root',
})
export class PresenceStateService {
  private presenceService = inject(PresenceService);

  // ============ FORWARDED STATE ============

  todayPresence = computed(() => this.presenceService.today());
  weeklyStats = computed(() => this.presenceService.stats());
  loading = computed(() => this.presenceService.isLoading());
  error = computed(() => this.presenceService.error());
  timerSeconds = computed(() => this.presenceService.timerSeconds());

  isCheckedIn = computed(() => this.presenceService.isWorking());
  isCheckedOut = computed(() => this.presenceService.isFinishedToday());
  hasCheckedOut = computed(() => this.presenceService.isFinishedToday());
  isPending = computed(() => this.presenceService.isSubmitting());
  isLoading = computed(() => this.presenceService.isLoading());

  timerDisplay = computed(() => {
    const secs = this.timerSeconds();
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
  });

  arrivalTime = computed(() => this.presenceService.today()?.heureEntree);
  departureTime = computed(() => this.presenceService.today()?.heureSortie);

  formattedTime = computed(() => this.presenceService.formattedTime());
  totalPresenceToday = computed(() => this.presenceService.totalPresenceToday());

  status = computed<'NONE' | 'CHECKED_IN' | 'CHECKED_OUT'>(() => {
    const presence = this.presenceService.today();
    if (!presence?.sessions?.length) return 'NONE';
    if (presence.activeSession) return 'CHECKED_IN';
    return 'CHECKED_OUT';
  });

  // ============ ACTIONS ============

  async checkIn(): Promise<void> {
    return this.presenceService.checkIn();
  }

  async checkOut(): Promise<void> {
    return this.presenceService.checkOut();
  }

  async loadTodayPresence(): Promise<void> {
    return this.presenceService.getToday();
  }

  async loadWeeklyStats(): Promise<void> {
    return this.presenceService.getStats();
  }

  async refresh(): Promise<void> {
    return this.presenceService.refresh();
  }

  clearError(): void {
    this.presenceService.clearError();
  }
}

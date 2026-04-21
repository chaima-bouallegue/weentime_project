import { Injectable, inject, signal, OnDestroy, effect, NgZone } from '@angular/core';
import { AuthService } from './auth.service';

/** Inactivity timeout in milliseconds (15 minutes) */
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

/** Warning threshold — show modal 1 minute before logout */
const WARNING_BEFORE_MS = 60 * 1000;

/** User activity events to track */
const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
  'mousemove',
  'keydown',
  'click',
  'scroll'
];

@Injectable({
  providedIn: 'root'
})
export class InactivityService implements OnDestroy {
  private authService = inject(AuthService);
  private ngZone = inject(NgZone);

  /** Emits true when the warning modal should be displayed */
  showWarning = signal(false);

  /** Seconds remaining before auto-logout (counts down from 60) */
  remainingSeconds = signal(60);

  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private warningTimer: ReturnType<typeof setTimeout> | null = null;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private boundResetTimer = this.onUserActivity.bind(this);
  private listenersAttached = false;

  constructor() {
    // React to auth state changes — start/stop tracking accordingly
    effect(() => {
      if (this.authService.isAuthenticated()) {
        this.startTracking();
      } else {
        this.stopTracking();
      }
    });
  }

  /** Resets all timers — called when user clicks "Rester connecté" */
  resetTimer(): void {
    this.showWarning.set(false);
    this.remainingSeconds.set(60);
    this.clearAllTimers();
    this.startTimers();
  }

  ngOnDestroy(): void {
    this.stopTracking();
  }

  private startTracking(): void {
    if (this.listenersAttached) return;
    this.listenersAttached = true;

    // Run outside Angular zone to avoid triggering change detection
    // on every mouse move / keydown
    this.ngZone.runOutsideAngular(() => {
      ACTIVITY_EVENTS.forEach(event => {
        document.addEventListener(event, this.boundResetTimer, { passive: true });
      });
    });

    this.startTimers();
  }

  private stopTracking(): void {
    if (!this.listenersAttached) return;

    ACTIVITY_EVENTS.forEach(event => {
      document.removeEventListener(event, this.boundResetTimer);
    });

    this.listenersAttached = false;
    this.clearAllTimers();
    this.showWarning.set(false);
    this.remainingSeconds.set(60);
  }

  private onUserActivity(): void {
    // Only reset if the warning is NOT showing — once the modal is up,
    // only explicit user action (click button) should reset
    if (!this.showWarning()) {
      this.clearAllTimers();
      this.startTimers();
    }
  }

  private startTimers(): void {
    const warningDelay = INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_MS;

    // Timer 1: show warning modal at 14 min
    this.warningTimer = setTimeout(() => {
      this.ngZone.run(() => {
        this.showWarning.set(true);
        this.remainingSeconds.set(Math.floor(WARNING_BEFORE_MS / 1000));
        this.startCountdown();
      });
    }, warningDelay);

    // Timer 2: auto-logout at 15 min
    this.inactivityTimer = setTimeout(() => {
      this.ngZone.run(() => {
        this.showWarning.set(false);
        this.authService.logout();
      });
    }, INACTIVITY_TIMEOUT_MS);
  }

  private startCountdown(): void {
    this.countdownInterval = setInterval(() => {
      this.ngZone.run(() => {
        const current = this.remainingSeconds();
        if (current <= 1) {
          this.clearCountdown();
          return;
        }
        this.remainingSeconds.set(current - 1);
      });
    }, 1000);
  }

  private clearAllTimers(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }
    this.clearCountdown();
  }

  private clearCountdown(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }
}

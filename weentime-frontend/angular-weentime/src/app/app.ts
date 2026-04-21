import { Component, inject } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './shared/components/navbar/navbar.component';
import { FooterComponent } from './shared/components/footer/footer.component';
import { SessionWarningModalComponent } from './shared/components/session-warning-modal/session-warning-modal.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { InactivityService } from './core/services/inactivity.service';
import { filter, map } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NavbarComponent, FooterComponent, SessionWarningModalComponent, ToastComponent],
  template: `
    @if (!hideLayout()) {
      <app-navbar />
    }
    <router-outlet />
    @if (!hideLayout()) {
      <app-footer />
    }
    <app-session-warning-modal />
    <app-toast />
  `
})
export class AppComponent {
  private router = inject(Router);

  // Bootstrap the inactivity timer — injecting the service starts tracking
  private _inactivity = inject(InactivityService);

  /**
   * Walk the entire activated route tree and check if ANY ancestor
   * has data.hideLayout === true. This is critical for the shell route
   * which sets hideLayout on the parent /app, but child routes don't.
   */
  hideLayout = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => {
        let route = this.router.routerState.root;
        while (route) {
          if (route.snapshot.data['hideLayout'] === true) {
            return true;
          }
          route = route.firstChild!;
        }
        return false;
      })
    ),
    { initialValue: false }
  );
}

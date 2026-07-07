import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { ShellSidebarComponent } from './components/shell-sidebar/shell-sidebar.component';
import { ShellHeaderComponent } from './components/shell-header/shell-header.component';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { LoadingService } from '../../core/services/loading.service';
import { ChatWidgetComponent } from '../../shared/chat-widget/chat-widget.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, ShellSidebarComponent, ShellHeaderComponent, ChatWidgetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell-layout" [class.full-screen-mode]="isCreateMeetingPage()">
      @if (!isCreateMeetingPage()) {
        <app-shell-sidebar />
      }
      <div class="shell-main">
        <div class="global-loader" [class.visible]="loadingService.isLoading()"></div>
        @if (!isCreateMeetingPage()) {
          <app-shell-header />
        }
        <main class="shell-content" [class.no-padding]="isCreateMeetingPage()">
          <router-outlet />
        </main>
      </div>
    </div>
    <app-chat-widget />
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    .shell-layout {
      display: flex;
      flex: 1;
      overflow: hidden;
      margin: 0;
      padding: 0;
      font-family: 'Plus Jakarta Sans', sans-serif;
      background:
        radial-gradient(circle at top left, rgba(37, 99, 235, 0.08), transparent 24%),
        radial-gradient(circle at bottom right, rgba(20, 184, 166, 0.1), transparent 28%),
        #f8fafc;
    }


    :host-context(.dark) .shell-layout {
      background:
        radial-gradient(circle at top left, rgba(59, 130, 246, 0.12), transparent 22%),
        radial-gradient(circle at bottom right, rgba(20, 184, 166, 0.12), transparent 24%),
        #0b1120;
    }

    .shell-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0;
      overflow: hidden;
      min-width: 0;
      position: relative;
    }

    .global-loader {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 3px;
      background: linear-gradient(90deg, #0ea5e9, #10b981 45%, #f59e0b 100%);
      transform: scaleX(0);
      transform-origin: left;
      opacity: 0;
      transition: opacity 0.18s ease, transform 0.18s ease;
      z-index: 20;
    }

    .global-loader.visible {
      opacity: 1;
      transform: scaleX(1);
    }

    .shell-content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 16px 24px 60px;
      position: relative;
    }

    .shell-content.no-padding {
      padding: 0;
      height: 100vh;
      overflow: hidden;
    }

    @media (max-width: 768px) {
      .shell-content {
        padding: 16px;
      }
    }
  `]
})
export class ShellComponent {
  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);
  readonly loadingService = inject(LoadingService);
  private readonly router = inject(Router);

  isCreateMeetingPage(): boolean {
    return this.router.url.includes('/app/reunions/create');
  }

  constructor() {
    effect(() => {
      const userId = this.authService.currentUser()?.id ?? null;
      if (!userId) {
        return;
      }
      this.notificationService.connectWebSocket(userId);
    });
  }
}

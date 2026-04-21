import { Component, ChangeDetectionStrategy } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-employee-profil',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="placeholder-page">
      <div class="placeholder-card">
        <div class="placeholder-icon"><lucide-icon name="user" size="40"></lucide-icon></div>
        <h1 class="placeholder-title">Mon profil</h1>
        <p class="placeholder-desc">Ce module est en cours de développement. Vous pourrez bientôt modifier vos informations personnelles et professionnelles ici.</p>
      </div>
    </div>
  `,
  styles: [`
    .placeholder-page { display: flex; align-items: center; justify-content: center; min-height: 60vh; }
    .placeholder-card { text-align: center; background: #fff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 48px 40px; max-width: 440px; }
    :host-context(.dark) .placeholder-card { background: #141821; border-color: #1e293b; }
    .placeholder-icon { color: #6366f1; margin-bottom: 16px; }
    .placeholder-title { font-size: 22px; font-weight: 800; color: #0f172a; margin: 0 0 8px; }
    :host-context(.dark) .placeholder-title { color: #f8fafc; }
    .placeholder-desc { font-size: 14px; color: #94a3b8; margin: 0; line-height: 1.6; }
  `]
})
export class EmployeeProfilComponent {}

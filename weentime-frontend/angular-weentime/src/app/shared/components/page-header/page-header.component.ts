import { Component, Input, inject, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LucideAngularModule, ChevronRight } from 'lucide-angular';
import { AuthService } from './../../../core/services/auth.service';

export interface Breadcrumb {
  label: string;
  link?: string;
}

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  templateUrl: './page-header.component.html',
  styles: [`
    :host { display: block; }
  `]
})
export class PageHeaderComponent {
  private authService = inject(AuthService);

  @Input() title: string = '';
  @Input() subtitle?: string;
  @Input() breadcrumbs: Breadcrumb[] = [];
  @Input() showEnterpriseBadge: boolean = false;

  iconChevron = ChevronRight;

  enterpriseName = computed(() => this.authService.currentUser()?.entreprise?.nom || 'Mon Entreprise');

  defaultSubtitle = computed(() => {
    const today = new Date();
    const dateStr = today.toLocaleDateString('fr-FR', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
    return dateStr;
  });
}

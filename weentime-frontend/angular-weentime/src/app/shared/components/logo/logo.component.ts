import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ThemeService } from '../../../core/services/theme.service';

@Component({
  selector: 'app-logo',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <a [routerLink]="linkTo" class="flex items-center gap-2 select-none no-underline group hover:opacity-90 transition-opacity">
      <div class="flex items-center">
        <!-- FULL LOGO (navbar) -->
        <img *ngIf="variant === 'full'"
          src="assets/images/favv.png"
          alt="WeenTime"
          class="w-auto object-contain"
          [style.height.px]="size * 7"/>

        <!-- WHITE VERSION (dark backgrounds) -->
        <img *ngIf="variant === 'white'"
          src="assets/images/favv.png"
          alt="WeenTime"
          class="w-auto object-contain"
          [style.height.px]="size * 7"
          style="filter: brightness(0) invert(1);"/>

        <!-- ICON ONLY -->
        <img *ngIf="variant === 'icon'"
          src="assets/images/weentime-icon.svg"
          alt="WeenTime"
          class="w-auto object-contain"
          [style.height.px]="size * 8"/>
      </div>

      @if (showText) {
        <span class="font-black tracking-tight" 
              [style.fontSize.px]="size * 2"
              [class.text-slate-900]="variant === 'full'"
              [class.text-white]="variant === 'white'"
              [style.color]="variant === 'full' ? '#1e293b' : null">
          Ween<span class="text-indigo-600" [style.color]="variant === 'white' ? '#818cf8' : '#6366f1'">Time</span>
        </span>
      }
    </a>
  `
})
export class LogoComponent {
  themeService = inject(ThemeService);

  @Input() variant: 'full' | 'white' | 'icon' = 'full';
  @Input() size: number = 12;
  @Input() showText: boolean = false;
  @Input() linkTo = '/';
}

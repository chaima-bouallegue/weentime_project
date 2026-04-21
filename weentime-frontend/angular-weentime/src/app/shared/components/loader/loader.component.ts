import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-loader',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex items-center justify-center p-4">
      <div class="flex gap-2">
        <div class="w-3 h-3 rounded-full bg-blue-500 animate-bounce" style="animation-delay: 0s;"></div>
        <div class="w-3 h-3 rounded-full bg-blue-500 animate-bounce" style="animation-delay: 0.15s;"></div>
        <div class="w-3 h-3 rounded-full bg-blue-500 animate-bounce" style="animation-delay: 0.3s;"></div>
      </div>
      <span *ngIf="message" class="ml-3 text-gray-600">{{ message }}</span>
    </div>
  `,
  styles: [`
    @keyframes bounce {
      0%, 80%, 100% {
        transform: translateY(0);
      }
      40% {
        transform: translateY(-10px);
      }
    }
  `]
})
export class LoaderComponent {
  @Input() message: string = 'Chargement...';
}

import { Component, Input, OnInit, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GeocodingService } from '../../../core/services/geocoding.service';

@Component({
  selector: 'app-location-display',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="location-display-container" [class.loading]="isLoading()">
      <span *ngIf="isLoading()" class="location-loader" aria-hidden="true">
        <span class="loader-dot"></span>
      </span>
      <span [title]="originalText || ''" class="location-text">
        {{ displayText() }}
      </span>
    </span>
  `,
  styles: [`
    .location-display-container {
      display: inline-flex;
      align-items: center;
      max-width: 100%;
    }
    
    .location-text {
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
    }
    
    .location-loader {
      display: inline-flex;
      align-items: center;
      margin-right: 6px;
      flex-shrink: 0;
    }
    
    .loader-dot {
      width: 8px;
      height: 8px;
      background-color: currentColor;
      border-radius: 50%;
      opacity: 0.6;
      animation: pulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    
    @keyframes pulse {
      0%, 100% {
        opacity: 0.2;
        transform: scale(0.8);
      }
      50% {
        opacity: 0.8;
        transform: scale(1.1);
      }
    }
  `]
})
export class LocationDisplayComponent implements OnInit, OnChanges {
  @Input() locationText: string | null | undefined = '';
  
  readonly displayText = signal<string>('');
  readonly isLoading = signal<boolean>(false);
  
  private readonly geocodingService = inject(GeocodingService);
  
  get originalText(): string {
    return this.locationText || '';
  }

  ngOnInit(): void {
    this.resolve();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['locationText'] && !changes['locationText'].firstChange) {
      this.resolve();
    }
  }

  private resolve(): void {
    const text = (this.locationText || '').trim();
    if (!text) {
      this.displayText.set('--');
      return;
    }

    // Regex to match "latitude, longitude" formats
    const coordRegex = /^-?\d+(\.\d+)?[,\s]+-?\d+(\.\d+)?$/;
    if (!coordRegex.test(text)) {
      this.displayText.set(text);
      return;
    }

    const parts = text.split(/[\s,]+/);
    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);

    if (isNaN(lat) || isNaN(lon)) {
      this.displayText.set(text);
      return;
    }

    this.isLoading.set(true);
    this.displayText.set(text); // Default display coordinates while loading

    this.geocodingService.geocode(lat, lon).subscribe({
      next: (result) => {
        this.displayText.set(result.address);
        this.isLoading.set(false);
      },
      error: () => {
        // Transparent fallback to raw coordinates
        this.displayText.set(text);
        this.isLoading.set(false);
      }
    });
  }
}

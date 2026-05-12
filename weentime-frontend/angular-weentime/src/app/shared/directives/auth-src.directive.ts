import { Directive, ElementRef, Input, OnDestroy, inject, OnChanges, SimpleChanges } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';

@Directive({
  selector: 'img[authSrc]',
  standalone: true
})
export class AuthSrcDirective implements OnChanges, OnDestroy {
  @Input('authSrc') authSrc?: string;
  
  private readonly el = inject(ElementRef<HTMLImageElement>);
  private readonly http = inject(HttpClient);
  private subscription?: Subscription;
  private objectUrl?: string;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['authSrc'] && this.authSrc) {
      this.loadImage();
    }
  }

  private loadImage(): void {
    this.cleanup();
    if (!this.authSrc) return;

    this.subscription = this.http.get(this.authSrc, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        this.objectUrl = URL.createObjectURL(blob);
        this.el.nativeElement.src = this.objectUrl;
      },
      error: () => {
        // Fallback or leave as is to show broken icon
      }
    });
  }

  private cleanup(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = undefined;
    }
  }

  ngOnDestroy(): void {
    this.cleanup();
  }
}

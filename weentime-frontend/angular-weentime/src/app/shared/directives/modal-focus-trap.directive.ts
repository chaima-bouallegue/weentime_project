import { Directive, ElementRef, HostListener, OnDestroy, OnInit, inject } from '@angular/core';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

@Directive({
  selector: '[appModalFocusTrap]',
  standalone: true
})
export class ModalFocusTrapDirective implements OnInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private previouslyFocused: HTMLElement | null = null;

  ngOnInit(): void {
    this.previouslyFocused = document.activeElement as HTMLElement | null;
    queueMicrotask(() => this.focusFirst());
  }

  ngOnDestroy(): void {
    this.previouslyFocused?.focus?.();
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') {
      return;
    }

    const root = this.host.nativeElement;
    const focusables = this.getFocusableElements(root);

    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement;

    if (event.shiftKey) {
      if (active === first || !root.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusFirst(): void {
    const root = this.host.nativeElement;
    const target =
      this.asHTMLElement(root.querySelector('[autofocus]')) ??
      this.getFocusableElements(root)[0] ??
      null;
    target?.focus();
  }

  private getFocusableElements(root: HTMLElement): HTMLElement[] {
    const nodes = root.querySelectorAll(FOCUSABLE);
    const list: HTMLElement[] = [];
    nodes.forEach(node => {
      const el = this.asHTMLElement(node);
      if (el && (el.offsetParent !== null || el === document.activeElement)) {
        list.push(el);
      }
    });
    return list;
  }

  private asHTMLElement(node: Element | null): HTMLElement | null {
    return node instanceof HTMLElement ? node : null;
  }
}

import { Injectable, inject, Injector, ComponentRef, Type, signal } from '@angular/core';
import { Overlay, OverlayConfig, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { filter, take } from 'rxjs/operators';

export interface DrawerConfig<T> {
  component: Type<T>;
  inputs?: Partial<T>;
  panelClass?: string | string[];
}

export interface DrawerRef<T> {
  close: () => void;
  componentRef: ComponentRef<T>;
}

@Injectable({ providedIn: 'root' })
export class OverlayDrawerService {
  private overlay = inject(Overlay);
  private injector = inject(Injector);

  readonly isOpen = signal(false);
  private overlayRef: OverlayRef | null = null;

  open<T>(config: DrawerConfig<T>): DrawerRef<T> {
    this.close();

    const overlayConfig: OverlayConfig = {
      positionStrategy: this.overlay.position().global().end(),
      hasBackdrop: true,
      backdropClass: 'overlay-drawer-backdrop',
      panelClass: config.panelClass ?? 'overlay-drawer-panel',
      scrollStrategy: this.overlay.scrollStrategies.block(),
    };

    this.overlayRef = this.overlay.create(overlayConfig);
    this.isOpen.set(true);

    this.overlayRef.backdropClick().subscribe(() => this.close());

    const portal = new ComponentPortal(config.component, null, this.injector);
    const componentRef = this.overlayRef.attach(portal) as unknown as ComponentRef<T>;

    if (config.inputs) {
      Object.assign(componentRef.instance as any, config.inputs);
    }
    componentRef.changeDetectorRef.detectChanges();

    const ref: DrawerRef<T> = {
      close: () => this.close(),
      componentRef,
    };
    return ref;
  }

  openModal<T>(config: DrawerConfig<T>): DrawerRef<T> {
    this.close();

    const overlayConfig: OverlayConfig = {
      positionStrategy: this.overlay.position().global().centerHorizontally().centerVertically(),
      hasBackdrop: true,
      backdropClass: 'overlay-drawer-backdrop',
      panelClass: config.panelClass ?? 'overlay-modal-panel',
      scrollStrategy: this.overlay.scrollStrategies.block(),
    };

    this.overlayRef = this.overlay.create(overlayConfig);
    this.isOpen.set(true);

    this.overlayRef.backdropClick()
      .pipe(take(1))
      .subscribe(() => this.close());

    this.overlayRef.keydownEvents()
      .pipe(
        filter(e => e.key === 'Escape'),
        take(1)
      )
      .subscribe(() => this.close());

    const portal = new ComponentPortal(config.component, null, this.injector);
    const componentRef = this.overlayRef.attach(portal) as unknown as ComponentRef<T>;

    if (config.inputs) {
      Object.assign(componentRef.instance as any, config.inputs);
    }
    componentRef.changeDetectorRef.detectChanges();

    const instance = componentRef.instance as any;
    if (instance.close && typeof instance.close.subscribe === 'function') {
      instance.close.pipe(take(1)).subscribe(() => this.close());
    }

    return {
      close: () => this.close(),
      componentRef,
    };
  }

  close(): void {
    if (this.overlayRef) {
      this.overlayRef.detach();
      this.overlayRef.dispose();
      this.overlayRef = null;
    }
    this.isOpen.set(false);
  }
}

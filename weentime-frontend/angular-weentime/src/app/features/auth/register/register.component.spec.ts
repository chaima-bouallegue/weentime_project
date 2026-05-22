// @vitest-environment jsdom

import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService, CompanyCodeValidationResponse } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { RegisterComponent } from './register.component';

class FakeAuthService {
  requestedCode: string | null = null;
  response$ = new Subject<CompanyCodeValidationResponse>();

  validateCompanyCode = vi.fn((code: string) => {
    this.requestedCode = code;
    this.response$ = new Subject<CompanyCodeValidationResponse>();
    return this.response$.asObservable();
  });

  register = vi.fn();
}

describe('RegisterComponent invitation code validation', () => {
  let authService: FakeAuthService;

  beforeEach(async () => {
    authService = new FakeAuthService();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
        { provide: ThemeService, useValue: { isDarkMode: vi.fn(() => false), toggleTheme: vi.fn() } }
      ]
    });
    TestBed.overrideComponent(RegisterComponent, { set: { template: '' } });
    await TestBed.compileComponents();
  });

  it('moves to step 2 after a valid active enterprise response', fakeAsync(() => {
    const fixture = TestBed.createComponent(RegisterComponent);
    const component = fixture.componentInstance;

    component.registerForm.get('step1.companyCode')?.setValue('WEEN-C3F302B5E8CF');
    tick(401);
    authService.response$.next({
      valid: true,
      enterpriseId: 1,
      enterpriseName: 'talan',
      status: 'ACTIVE',
      invitationCode: 'WEEN-C3F302B5E8CF'
    });
    authService.response$.complete();

    component.nextStep();

    expect(component.currentStep()).toBe(2);
    expect(component.foundCompany()?.id).toBe(1);
  }));

  it('shows the closed-enterprise message for ENTERPRISE_CLOSED', fakeAsync(() => {
    const fixture = TestBed.createComponent(RegisterComponent);
    const component = fixture.componentInstance;

    component.registerForm.get('step1.companyCode')?.setValue('WEEN-C3F302B5E8CF');
    tick(401);
    authService.response$.error(new HttpErrorResponse({
      status: 409,
      statusText: 'Conflict',
      error: { valid: false, reason: 'ENTERPRISE_CLOSED', message: 'Cette entreprise est fermee.' }
    }));

    expect(component.codeErrorMessage()).toBe('Cette entreprise est fermée. Contactez votre administrateur.');
  }));

  it('shows the invalid-code message for CODE_NOT_FOUND', fakeAsync(() => {
    const fixture = TestBed.createComponent(RegisterComponent);
    const component = fixture.componentInstance;

    component.registerForm.get('step1.companyCode')?.setValue('invalid-code');
    tick(401);
    authService.response$.error(new HttpErrorResponse({
      status: 404,
      statusText: 'Not Found',
      error: { valid: false, reason: 'CODE_NOT_FOUND', message: "Code d'invitation invalide ou expiré." }
    }));

    expect(component.codeErrorMessage()).toBe("Code d'invitation invalide ou expiré.");
  }));

  it('does not expose raw resource-not-found messages', fakeAsync(() => {
    const fixture = TestBed.createComponent(RegisterComponent);
    const component = fixture.componentInstance;

    component.registerForm.get('step1.companyCode')?.setValue('WEEN-C3F302B5E8CF');
    tick(401);
    authService.response$.error(new HttpErrorResponse({
      status: 404,
      statusText: 'Not Found',
      error: { message: 'La ressource demandee est introuvable.' }
    }));

    expect(component.codeErrorMessage()).toBe("Code d'invitation invalide ou expiré.");
  }));

  it('normalizes lowercase, spaced, and visual-prefixed codes before calling the API', fakeAsync(() => {
    const fixture = TestBed.createComponent(RegisterComponent);
    const component = fixture.componentInstance;

    component.registerForm.get('step1.companyCode')?.setValue('#N - C3F302B5E8CF');
    tick(401);

    expect(authService.validateCompanyCode).toHaveBeenCalledWith('WEEN-C3F302B5E8CF');
  }));
});

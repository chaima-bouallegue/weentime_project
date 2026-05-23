// @vitest-environment jsdom

import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { Router } from '@angular/router';
import { of, Subject } from 'rxjs';
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
  let injector: Injector;

  beforeEach(async () => {
    authService = new FakeAuthService();

    injector = Injector.create({
      providers: [
        FormBuilder,
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
        { provide: ThemeService, useValue: { isDarkMode: vi.fn(() => false), toggleTheme: vi.fn() } }
      ]
    });
    (globalThis as unknown as { __registerInjector?: Injector }).__registerInjector = injector;
  });

  it('moves to step 2 after a valid active enterprise response', async () => {
    const component = createComponent();

    component.registerForm.get('step1.companyCode')?.setValue('WEEN-22024');
    await flushCodeDebounce();
    authService.response$.next({
      valid: true,
      enterpriseId: 123,
      enterpriseName: 'Weentime SARL',
      status: 'ACTIVE',
      invitationCode: 'WEEN-22024'
    });
    authService.response$.complete();

    expect(component.currentStep()).toBe(2);
    expect(component.foundCompany()?.id).toBe(123);
  });

  it('shows the closed-enterprise message for ENTERPRISE_CLOSED', async () => {
    const component = createComponent();

    component.registerForm.get('step1.companyCode')?.setValue('WEEN-22024');
    await flushCodeDebounce();
    authService.response$.error(new HttpErrorResponse({
      status: 409,
      statusText: 'Conflict',
      error: { valid: false, reason: 'ENTERPRISE_CLOSED', message: 'Cette entreprise est fermee.' }
    }));

    expect(component.codeErrorMessage()).toBe('Cette entreprise est fermée. Contactez votre administrateur.');
  });

  it('shows the invalid-code message for CODE_NOT_FOUND', async () => {
    const component = createComponent();

    component.registerForm.get('step1.companyCode')?.setValue('invalid-code');
    await flushCodeDebounce();
    authService.response$.error(new HttpErrorResponse({
      status: 404,
      statusText: 'Not Found',
      error: { valid: false, reason: 'CODE_NOT_FOUND', message: "Code d'invitation invalide ou expiré." }
    }));

    expect(component.codeErrorMessage()).toBe("Code d'invitation invalide ou expiré.");
  });

  it('does not expose raw resource-not-found messages', async () => {
    const component = createComponent();

    component.registerForm.get('step1.companyCode')?.setValue('WEEN-22024');
    await flushCodeDebounce();
    authService.response$.error(new HttpErrorResponse({
      status: 404,
      statusText: 'Not Found',
      error: { message: 'La ressource demandee est introuvable.' }
    }));

    expect(component.codeErrorMessage()).toBe("Code d'invitation invalide ou expiré.");
  });

  it('normalizes lowercase codes before calling the API', async () => {
    const component = createComponent();

    component.registerForm.get('step1.companyCode')?.setValue('ween-22024');
    await flushCodeDebounce();

    expect(authService.validateCompanyCode).toHaveBeenCalledWith('WEEN-22024');
  });

  it('normalizes spaced codes before calling the API', async () => {
    const component = createComponent();

    component.registerForm.get('step1.companyCode')?.setValue(' WEEN 22024 ');
    await flushCodeDebounce();

    expect(authService.validateCompanyCode).toHaveBeenCalledWith('WEEN22024');
  });

  it('normalizes visual-prefixed codes before calling the API', async () => {
    const component = createComponent();

    component.registerForm.get('step1.companyCode')?.setValue('#N - C3F302B5E8CF');
    await flushCodeDebounce();

    expect(authService.validateCompanyCode).toHaveBeenCalledWith('WEEN-C3F302B5E8CF');
  });

  it('includes a normalized optional phone number in the registration payload', () => {
    const component = createComponent();
    authService.register.mockReturnValue(of({ token: '', userId: 7, email: 'jane@example.com', roles: [], message: 'ok' }));

    component.foundCompany.set({ id: 123, name: 'Weentime SARL', industry: '', employees: '' });
    component.registerForm.patchValue({
      step1: { companyCode: 'WEEN-22024' },
      step2: {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        password: 'Password123!',
        jobTitle: 'Manager',
        telephone: '+216 12 345 678'
      },
      step4: { acceptTerms: true }
    });

    component.onSubmit();

    expect(authService.register).toHaveBeenCalledWith(expect.objectContaining({
      telephone: '+21612345678'
    }));
  });
});

function createComponent(): RegisterComponent {
  const currentInjector = (globalThis as unknown as { __registerInjector?: Injector }).__registerInjector;
  return runInInjectionContext(currentInjector!, () => new RegisterComponent());
}

function flushCodeDebounce(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 450));
}

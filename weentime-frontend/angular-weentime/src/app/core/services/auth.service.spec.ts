import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

describe('AuthService stored tenant normalization', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } }
      ]
    });
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('does not coerce a null entreprise id to zero', () => {
    localStorage.setItem('token', 'header.payload.signature');
    localStorage.setItem('user', JSON.stringify({
      id: 1,
      email: 'admin@weentime.com',
      role: 'ADMIN',
      roles: ['ADMIN'],
      entrepriseId: null
    }));

    const service = TestBed.inject(AuthService);

    expect(service.currentUser()?.entrepriseId).toBeUndefined();
  });

  it('removes a stale zero tenant id from storage state', () => {
    localStorage.setItem('token', 'header.payload.signature');
    localStorage.setItem('user', JSON.stringify({
      id: 1,
      email: 'admin@weentime.com',
      role: 'ADMIN',
      roles: ['ADMIN'],
      entrepriseId: 0
    }));

    const service = TestBed.inject(AuthService);

    expect(service.currentUser()?.entrepriseId).toBeUndefined();
  });
});

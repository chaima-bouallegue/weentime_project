import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CommunicationApiService } from './communication-api.service';

describe('CommunicationApiService', () => {
  let service: CommunicationApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(CommunicationApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('rejects an invalid entreprise id without issuing HTTP', () => {
    let message = '';
    service.syncCommunication(0).subscribe({
      error: error => message = error.message
    });

    expect(message).toContain('valid entreprise context');
    httpMock.expectNone(request => request.url.includes('/communication/admin/sync'));
  });

  it('uses the tenant-scoped sync endpoint for a positive entreprise id', () => {
    service.syncCommunication(13).subscribe();

    const request = httpMock.expectOne(
      'http://localhost:8222/api/v1/communication/admin/sync/enterprise/13'
    );
    expect(request.request.method).toBe('POST');
    request.flush({ success: true, data: {} });
  });
});

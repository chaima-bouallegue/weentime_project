import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RhParametresCrudComponent } from './rh-parametres-crud.component';
import { environment } from '../../../../../environments/environment';

describe('RhParametresCrudComponent type-conges consistency', () => {
  let fixture: ComponentFixture<RhParametresCrudComponent>;
  let component: RhParametresCrudComponent;
  let httpMock: HttpTestingController;

  const typeCongesUrl = `${environment.apiUrl}/rh/type-conges`;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RhParametresCrudComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RhParametresCrudComponent);
    component = fixture.componentInstance;
    component.title = 'Types de Congés';
    component.endpoint = 'rh/type-conges';
    component.columns = [
      { key: 'libelle', label: 'Libellé', type: 'text', required: true },
      { key: 'joursMax', label: 'Jours max', type: 'number' }
    ];
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('refreshes the type-conges list after a 409 conflict', () => {
    fixture.detectChanges();
    httpMock.expectOne(typeCongesUrl).flush([
      { id: 1, libelle: 'maladie' }
    ]);

    component.openModal();
    component.form.get('libelle')?.setValue('Congé maternité');
    component.save();

    httpMock.expectOne(typeCongesUrl).flush({
      message: 'Un type de conge avec ce libelle existe deja pour cette entreprise.'
    }, {
      status: 409,
      statusText: 'Conflict'
    });
    httpMock.expectOne(typeCongesUrl).flush([
      { id: 1, libelle: 'maladie' },
      { id: 2, libelle: 'Congé maternité' }
    ]);

    expect(component.data().map(item => item.libelle)).toEqual(['maladie', 'Congé maternité']);
    expect(component.form.get('libelle')?.hasError('duplicateLibelle')).toBe(true);
  });

  it('uses the refreshed list for accent-insensitive duplicate validation', () => {
    fixture.detectChanges();
    httpMock.expectOne(typeCongesUrl).flush([
      { id: 1, libelle: 'maladie' }
    ]);

    component.openModal();
    component.form.get('libelle')?.setValue('Congé maternité');
    component.save();

    httpMock.expectOne(typeCongesUrl).flush({
      message: 'Un type de conge avec ce libelle existe deja pour cette entreprise.'
    }, {
      status: 409,
      statusText: 'Conflict'
    });
    httpMock.expectOne(typeCongesUrl).flush([
      { id: 1, libelle: 'maladie' },
      { id: 2, libelle: 'Congé maternité' }
    ]);

    component.form.get('libelle')?.setValue('   CONGE   MATERNITE  ');

    expect(component.form.get('libelle')?.hasError('duplicateLibelle')).toBe(true);
  });
});

import { DemandesRhListComponent } from './demandes-rh-list.component';

describe('DemandesRhListComponent', () => {
  const component = new DemandesRhListComponent();

  it('renders a fallback for a missing motif', () => {
    expect(component.truncateMotif(null)).toBe('-');
    expect(component.truncateMotif(undefined)).toBe('-');
    expect(component.truncateMotif('   ')).toBe('-');
  });

  it('trims and truncates a motif safely', () => {
    expect(component.truncateMotif('  Motif court  ')).toBe('Motif court');
    expect(component.truncateMotif('123456', 4)).toBe('1234...');
  });
});

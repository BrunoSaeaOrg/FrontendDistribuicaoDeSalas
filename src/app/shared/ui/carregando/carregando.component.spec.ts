import { TestBed } from '@angular/core/testing';
import { CarregandoComponent } from './carregando.component';

describe('CarregandoComponent', () => {
  afterEach(() => vi.useRealTimers());

  function montar(estimativaMs: number | null) {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(CarregandoComponent);
    fixture.componentRef.setInput('ativo', true);
    fixture.componentRef.setInput('texto', 'Lendo os alunos...');
    fixture.componentRef.setInput('estimativaMs', estimativaMs);
    fixture.detectChanges();
    return fixture;
  }

  it('sem estimativa mostra o spinner', () => {
    const fixture = montar(null);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.saea-carregando-spinner')).not.toBeNull();
    expect(el.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('com estimativa mostra a barra, que anda com o tempo e não chega ao fim sozinha', () => {
    const fixture = montar(20_000);
    const el: HTMLElement = fixture.nativeElement;
    const barra = () => el.querySelector('[role="progressbar"]')!;
    expect(Number(barra().getAttribute('aria-valuenow'))).toBe(0);

    vi.advanceTimersByTime(20_000);
    fixture.detectChanges();
    expect(Number(barra().getAttribute('aria-valuenow'))).toBe(60);
    expect(el.querySelector('.saea-carregando-detalhe')!.textContent).toContain('20 s · costuma levar cerca de 20 s');

    vi.advanceTimersByTime(10 * 60_000);
    fixture.detectChanges();
    expect(Number(barra().getAttribute('aria-valuenow'))).toBe(95);
  });

  it('formata o tempo em segundos e minutos', () => {
    const c = montar(1000).componentInstance;
    expect([c.segundos(4200), c.segundos(60_000), c.segundos(75_000)]).toEqual(['4 s', '1 min', '1 min 15 s']);
  });
});

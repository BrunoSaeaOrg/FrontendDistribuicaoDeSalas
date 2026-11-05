import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MultiSelectComponent } from './multi-select.component';

const UNIDADES = [
  { value: '2', label: 'CASJ 1' },
  { value: '13', label: 'CASJ 2' },
  { value: '16', label: 'CASJ 3' },
  { value: '6', label: 'Liceu' },
];

describe('MultiSelectComponent com "Todas as unidades"', () => {
  let fixture: ComponentFixture<MultiSelectComponent>;
  const campo = () => fixture.componentInstance;
  const botao = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.ms-gatilho')!;

  beforeEach(() => {
    fixture = TestBed.createComponent(MultiSelectComponent);
    fixture.componentRef.setInput('label', 'Unidade');
    fixture.componentRef.setInput('options', UNIDADES);
    fixture.componentRef.setInput('todas', 'Todas as unidades');
    fixture.componentRef.setInput('placeholder', 'Todas as unidades');
    fixture.componentRef.setInput('nenhumaEhTodas', true);
    fixture.detectChanges();
  });

  it('tem rótulo ligado ao botão, como os outros campos', () => {
    const rotulo = (fixture.nativeElement as HTMLElement).querySelector('label')!;
    expect(rotulo.textContent?.trim()).toBe('Unidade');
    expect(rotulo.getAttribute('for')).toBe(botao().id);
  });

  it('o botão mostra "Todas as unidades", os nomes (até dois) ou quantas estão marcadas', () => {
    expect(botao().textContent).toContain('Todas as unidades');

    campo().selected.set(['13']);
    fixture.detectChanges();
    expect(botao().textContent).toContain('CASJ 2');

    // Os nomes vão na ordem da lista, não na ordem em que foram marcados.
    campo().selected.set(['6', '2']);
    fixture.detectChanges();
    expect(botao().textContent).toContain('CASJ 1, Liceu');
    expect(botao().title).toBe('CASJ 1\nLiceu');

    campo().selected.set(['2', '13', '6']);
    fixture.detectChanges();
    expect(botao().textContent).toContain('3 selecionadas');

    campo().selected.set(['2', '13', '16', '6']);
    fixture.detectChanges();
    expect(botao().textContent).toContain('Todas as unidades');
  });

  it('"Todas as unidades" marca todas e, desmarcada, tira todas', () => {
    campo().marcarTodas(true);
    expect(campo().selected()).toEqual(['2', '13', '16', '6']);
    expect([campo().todasMarcadas(), campo().algumasMarcadas()]).toEqual([true, false]);

    campo().alternar('16', false);
    expect([campo().todasMarcadas(), campo().algumasMarcadas()]).toEqual([false, true]);

    campo().marcarTodas(false);
    expect(campo().selected()).toEqual([]);
  });

  it('sem "nenhumaEhTodas", nenhuma marcada mostra o placeholder', () => {
    fixture.componentRef.setInput('nenhumaEhTodas', false);
    fixture.componentRef.setInput('placeholder', 'Selecione as unidades...');
    fixture.detectChanges();
    expect(botao().textContent).toContain('Selecione as unidades...');
    expect(botao().classList).not.toContain('ms-gatilho--marcado');
  });
});

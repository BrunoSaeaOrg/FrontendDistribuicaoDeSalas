import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { SelectComponent, SelectOption } from '../select/select.component';
import { InputComponent } from './input.component';

/** Uma tela como a de Regras: o valor vem de um signal e volta por código (o "Restaurar"). */
@Component({
  standalone: true,
  imports: [FormsModule, InputComponent, SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-input label="Área" [ngModel]="area()" (ngModelChange)="area.set($event)" />
    <app-select label="Turno" [ngModel]="turno()" (ngModelChange)="turno.set($event)" [options]="opcoes" />
  `,
})
class TelaComCampos {
  readonly area = signal<string | number>(1.5);
  readonly turno = signal('manha');
  readonly opcoes: SelectOption[] = [
    { value: 'manha', label: 'Manhã' },
    { value: 'tarde', label: 'Tarde' },
  ];
}

describe('app-input e app-select: o valor trocado por código aparece no campo', () => {
  let fixture: ComponentFixture<TelaComCampos>;
  const campo = () => (fixture.nativeElement as HTMLElement).querySelector('input')!;
  const lista = () => (fixture.nativeElement as HTMLElement).querySelector('select')!;

  /** O ngModel escreve no campo num tique seguinte. */
  const atualizar = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    fixture = TestBed.createComponent(TelaComCampos);
    await atualizar();
  });

  it('app-input: digitar e depois voltar o valor por código mostra o valor de volta', async () => {
    expect(campo().value).toBe('1.5');

    campo().value = '80';
    campo().dispatchEvent(new Event('input'));
    await atualizar();
    expect(fixture.componentInstance.area()).toBe('80');

    // O "Restaurar": o formulário volta para o valor salvo.
    fixture.componentInstance.area.set(1.5);
    await atualizar();
    expect(campo().value).toBe('1.5');
  });

  it('app-select: trocar e depois voltar o valor por código mostra a opção de volta', async () => {
    expect(lista().value).toBe('manha');

    lista().value = 'tarde';
    lista().dispatchEvent(new Event('change'));
    await atualizar();
    expect(fixture.componentInstance.turno()).toBe('tarde');

    fixture.componentInstance.turno.set('manha');
    await atualizar();
    expect(lista().value).toBe('manha');
  });
});

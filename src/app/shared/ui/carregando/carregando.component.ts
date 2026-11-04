import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Véu de carregamento sobre o elemento pai, que precisa de position: relative (a classe global
 * .saea-carregavel, posta no app-card). Enquanto `ativo`, cobre o conteúdo com o spinner e o texto,
 * para dados velhos não parecerem os novos; o conteúdo continua no lugar, então nada pula quando a
 * carga termina.
 */
@Component({
  selector: 'app-carregando',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ativo()) {
      <div class="saea-carregando" role="status">
        <span class="saea-carregando-spinner" aria-hidden="true"></span>
        <span class="saea-carregando-texto">{{ texto() }}</span>
      </div>
    }
  `,
  styleUrl: './carregando.component.css',
})
export class CarregandoComponent {
  readonly ativo = input(false);
  readonly texto = input('Carregando...');
}

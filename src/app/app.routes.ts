import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'painel' },
  {
    path: 'painel',
    loadComponent: () => import('./features/painel/painel.component').then((m) => m.PainelComponent),
    data: { breadcrumb: 'Painel' },
  },
  {
    path: 'planta',
    loadComponent: () => import('./features/planta/planta.component').then((m) => m.PlantaComponent),
    data: { breadcrumb: 'Planta da sala' },
  },
  {
    path: 'turmas',
    loadComponent: () => import('./features/turmas/turmas.component').then((m) => m.TurmasComponent),
    data: { breadcrumb: 'Salas → Turmas' },
  },
  {
    path: 'solicitacoes',
    loadComponent: () =>
      import('./features/solicitacoes/solicitacoes.component').then((m) => m.SolicitacoesComponent),
    data: { breadcrumb: 'Solicitações' },
  },
  {
    path: 'regras',
    loadComponent: () => import('./features/regras/regras.component').then((m) => m.RegrasComponent),
    data: { breadcrumb: 'Regras de ocupação' },
  },
  {
    path: 'ocupacao',
    loadComponent: () =>
      import('./features/ocupacao/ocupacao.component').then((m) => m.OcupacaoComponent),
    data: { breadcrumb: 'Mapa de Ocupação' },
  },
  { path: '**', redirectTo: 'painel' },
];

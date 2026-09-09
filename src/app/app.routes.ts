import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'painel' },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'painel',
    canActivate: [authGuard],
    loadComponent: () => import('./features/painel/painel.component').then((m) => m.PainelComponent),
    data: { breadcrumb: 'Painel' },
  },
  {
    path: 'planta',
    canActivate: [authGuard],
    loadComponent: () => import('./features/planta/planta.component').then((m) => m.PlantaComponent),
    data: { breadcrumb: 'Planta da sala' },
  },
  {
    path: 'turmas',
    canActivate: [authGuard],
    loadComponent: () => import('./features/turmas/turmas.component').then((m) => m.TurmasComponent),
    data: { breadcrumb: 'Salas → Turmas' },
  },
  {
    path: 'solicitacoes',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/solicitacoes/solicitacoes.component').then((m) => m.SolicitacoesComponent),
    data: { breadcrumb: 'Solicitações' },
  },
  {
    path: 'regras',
    canActivate: [authGuard],
    loadComponent: () => import('./features/regras/regras.component').then((m) => m.RegrasComponent),
    data: { breadcrumb: 'Regras de ocupação' },
  },
  {
    path: 'ocupacao',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/ocupacao/ocupacao.component').then((m) => m.OcupacaoComponent),
    data: { breadcrumb: 'Mapa de Ocupação' },
  },
  { path: '**', redirectTo: 'painel' },
];

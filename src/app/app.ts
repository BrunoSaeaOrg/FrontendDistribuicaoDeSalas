import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from './core/auth/auth.service';
import { HeaderComponent } from './layout/header/header.component';
import { FooterComponent } from './layout/footer/footer.component';
import { SidePanelComponent, SidePanelItem } from './layout/side-panel/side-panel.component';
import { BreadcrumbComponent, BreadcrumbItem } from './shared/ui/breadcrumb/breadcrumb.component';
import { ToastStackComponent } from './shared/ui/toast/toast-stack.component';

const NAV_ITEMS: SidePanelItem[] = [
  { icon: 'space_dashboard', label: 'Painel', description: 'Ocupação e capacidade das salas.', route: 'painel' },
  { icon: 'chair', label: 'Planta da sala', description: 'Disposição das carteiras e movimentação.', route: 'planta' },
  { icon: 'groups', label: 'Salas → Turmas', description: 'Vínculo das turmas por turno.', route: 'turmas' },
  { icon: 'inbox', label: 'Solicitações', description: 'Pedidos de novas carteiras.', route: 'solicitacoes' },
  { icon: 'rule', label: 'Regras de ocupação', description: 'Critérios de capacidade física.', route: 'regras' },
  { icon: 'bar_chart', label: 'Mapa de Ocupação', description: 'Total por unidade, turno, segmento, série e turma.', route: 'ocupacao' },
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    HeaderComponent,
    FooterComponent,
    SidePanelComponent,
    // BreadcrumbComponent,
    ToastStackComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);

  readonly navItems = NAV_ITEMS;
  readonly navCollapsed = signal(false);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.split('/')[1] ?? 'painel'),
      startWith('painel'),
    ),
    { initialValue: 'painel' },
  );

  private readonly currentBreadcrumbLabel = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.readBreadcrumb()),
      startWith(this.readBreadcrumb()),
    ),
    { initialValue: 'Painel' },
  );

  readonly activeRoute = computed(() => this.currentUrl());
  readonly isAuthRoute = computed(() => this.activeRoute() === 'login');

  readonly breadcrumbItems = computed<BreadcrumbItem[]>(() => [
    { label: 'Infraestrutura' },
    { label: this.currentBreadcrumbLabel() },
  ]);

  onItemClick(item: SidePanelItem): void {
    this.router.navigate([item.route]);
  }

  onSignOut(): void {
    this.authService.logout();
  }

  private readBreadcrumb(): string {
    let route = this.activatedRoute.firstChild;
    while (route?.firstChild) route = route.firstChild;
    return (route?.snapshot.data?.['breadcrumb'] as string) ?? 'Painel';
  }
}

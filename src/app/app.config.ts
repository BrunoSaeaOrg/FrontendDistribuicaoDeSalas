import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { authInterceptor } from './core/auth/auth.interceptor';
import { PreferenciasService } from './core/services/preferencias.service';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideNoopAnimations(),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Layout e tema do colaborador (e o login sempre claro) já na primeira tela.
    provideAppInitializer(() => {
      inject(PreferenciasService);
    }),
  ],
};

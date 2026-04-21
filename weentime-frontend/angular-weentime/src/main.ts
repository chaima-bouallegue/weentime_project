(window as any).global = window;
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app';
import { logError } from './app/core/utils/logger';

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => logError('Application bootstrap failed', err));

import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

try {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), {
    errorOnUnknownElements: true,
    errorOnUnknownProperties: true,
  });
} catch (e: unknown) {
  if (e instanceof Error && e.message === 'Cannot set base providers because it has already been called') {
    // Already initialized by the builder's init-testbed.js -- nothing to do.
  } else {
    throw e;
  }
}

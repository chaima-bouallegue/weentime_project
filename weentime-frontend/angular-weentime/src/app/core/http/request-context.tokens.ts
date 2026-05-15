import { HttpContext, HttpContextToken } from '@angular/common/http';

export const SKIP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);
export const SKIP_AUTH_REDIRECT = new HttpContextToken<boolean>(() => false);
export const AI_CHAT_WIDGET_REQUEST = new HttpContextToken<boolean>(() => false);

export function withAiChatWidgetContext(context: HttpContext = new HttpContext()): HttpContext {
  return context
    .set(AI_CHAT_WIDGET_REQUEST, true)
    .set(SKIP_ERROR_TOAST, true)
    .set(SKIP_AUTH_REDIRECT, true);
}

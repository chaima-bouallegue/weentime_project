/**
 * Safe text utilities for the chatbot widget.
 *
 * The chatbot receives heterogeneous payloads — strings, objects with a
 * `text`/`message`/`summary` field, arrays of those, or null. Earlier
 * iterations of the widget called `value?.trim()` directly, which only
 * survives null/undefined; when an object slips through, `.trim()` is not
 * a function and the view crashes. `safeDisplayText` coerces any input to
 * a displayable string and never throws.
 *
 * AI_FE_05 added `safeTrimmedString` for the assistant-text extraction
 * path; RH-AGENT-HOTFIX-01 generalises it for all renderer paths.
 */

/** Returns the input value as a string if it is one (post-trim, non-empty),
 *  otherwise null. Use when you specifically want to know "did I get a
 *  trimmable string?". */
export function safeTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Always returns a string. Never throws. Handles:
 *  - string -> the trimmed string (or '' if empty after trim)
 *  - null / undefined -> ''
 *  - number / boolean -> stringified
 *  - array -> recurses into each element, joins with ', ', skipping blanks
 *  - object -> tries common chatbot envelope fields (text, message, summary,
 *              error, body, content, response); falls back to JSON.stringify
 *
 *  Use for any renderer path where the upstream value's runtime type is not
 *  guaranteed to be a string. Replaces direct `value?.trim()` calls. */
export function safeDisplayText(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => safeDisplayText(item))
      .filter((part) => part.length > 0)
      .join(', ');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['text', 'message', 'summary', 'error', 'body', 'content', 'response']) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

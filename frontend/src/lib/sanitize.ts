import DOMPurify from 'dompurify';

/**
 * Sanitise rich text before it is rendered.
 *
 * Authors are trusted, but stored HTML still goes through DOMPurify on the
 * way in (server side, on save) and on the way out (client side, on
 * render), so a compromised or buggy editor cannot inject script.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return '';

  if (typeof window === 'undefined') {
    // On the server there is no DOM, so fall back to a conservative
    // allow-list strip of the dangerous constructs.
    return html
      .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
      .replace(/<\s*iframe[^>]*>[\s\S]*?<\s*\/\s*iframe\s*>/gi, '')
      .replace(/<\s*object[^>]*>[\s\S]*?<\s*\/\s*object\s*>/gi, '')
      .replace(/<\s*embed[^>]*>/gi, '')
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
      .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
      .replace(/javascript:/gi, '');
  }

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'a', 'img', 'figure', 'figcaption',
      'pre', 'code', 'blockquote',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'hr', 'span', 'div',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'src', 'alt', 'title', 'width', 'height',
      'class', 'colspan', 'rowspan', 'data-type', 'data-language',
    ],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/)/i,
  });
}

/** Strip all HTML and return plain text - used for previews and search. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

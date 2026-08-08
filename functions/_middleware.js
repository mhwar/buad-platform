/**
 * Custom-domain routing for association websites.
 *
 * An association can point its own domain at this Pages project. When a page request
 * arrives on a hostname that is NOT one of the platform's own, we serve the association
 * site renderer, which then asks the API who lives on that hostname
 * (GET /api/public/org-site-by-host).
 *
 * OPT-IN BY DESIGN: with no PLATFORM_HOSTS environment variable set, this middleware is a
 * pure pass-through and changes nothing. Set PLATFORM_HOSTS (comma-separated) to the
 * platform's own hostnames to switch custom-domain routing on — e.g.
 *     PLATFORM_HOSTS = "buad.sa,www.buad.sa"
 * Getting that list wrong would serve the wrong page on the platform's own domain, so it
 * must be stated explicitly rather than guessed.
 *
 * Never intercepted: /api/*, and any path with a file extension (assets, images, fonts).
 */

const ALWAYS_PLATFORM = [/\.pages\.dev$/, /^localhost$/, /^127\.0\.0\.1$/, /^\[?::1\]?$/];

function isPlatformHost(hostname, platformHostsEnv) {
  const host = String(hostname || '').toLowerCase().replace(/^www\./, '');
  if (ALWAYS_PLATFORM.some(function (re) { return re.test(host) || re.test(hostname); })) return true;
  return String(platformHostsEnv || '')
    .split(',')
    .map(function (h) { return h.trim().toLowerCase().replace(/^www\./, ''); })
    .filter(Boolean)
    .indexOf(host) >= 0;
}

/* A request we may rewrite: a top-level HTML document, not an API call, not a static asset. */
function isPageRequest(url, request) {
  if (url.pathname.indexOf('/api/') === 0 || url.pathname === '/api') return false;
  const last = url.pathname.split('/').pop() || '';
  if (last.indexOf('.') >= 0) return false;                    // has a file extension
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  const accept = request.headers.get('Accept') || '';
  return accept.indexOf('text/html') >= 0;
}

export async function onRequest(context) {
  const { request, env, next } = context;

  /* Not configured → do nothing at all. */
  if (!env || !env.PLATFORM_HOSTS) return next();

  const url = new URL(request.url);
  if (isPlatformHost(url.hostname, env.PLATFORM_HOSTS)) return next();
  if (!isPageRequest(url, request)) return next();

  /* Custom domain: hand the request to the association site renderer.
     It resolves the association from location.hostname. */
  const target = new URL(url.toString());
  target.pathname = '/org-site.html';
  return next(new Request(target.toString(), request));
}

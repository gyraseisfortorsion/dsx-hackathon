import schema from '../../openapi.json';

const routes = Object.entries(schema.paths).map(([path, methods]) => ({
  pattern: new RegExp(`^${path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+')}$`),
  methods: Object.keys(methods).map(method => method.toUpperCase()),
}));

/** Same-origin web transport for the fixed student API, which does not expose CORS headers. */
export async function proxyStudentRequest(request: Request) {
  const base = process.env.EXPO_PUBLIC_API_URL;
  if (!base) return Response.json({ detail: 'The student API is not configured.' }, { status: 503 });
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/student/, '');
  if (!routes.some(route => route.pattern.test(path) && route.methods.includes(request.method))) {
    return Response.json({ detail: 'Unknown student API route.' }, { status: 404 });
  }
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return Response.json({ detail: 'Authentication is required.' }, { status: 401 });
  const upstream = new URL(base);
  upstream.pathname = `${upstream.pathname.replace(/\/$/, '')}${path}`;
  upstream.search = url.search;
  const headers = new Headers({ Accept: 'application/json', Authorization: authorization });
  const moderator = request.headers.get('x-moderator-token');
  if (moderator) headers.set('x-moderator-token', moderator);
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  try {
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(90_000)]),
      redirect: 'error',
    });
    return new Response(response.body, { status: response.status, headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ detail: 'Could not reach the student API. Your entries have been kept. Try again in a moment.' }, { status: 503 });
  }
}

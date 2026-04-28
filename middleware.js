export const config = { matcher: '/' };

export default function middleware(request) {
  const accept = request.headers.get('accept') || '';
  if (accept.includes('text/markdown')) {
    return new Response(null, {
      status: 200,
      headers: {
        'x-middleware-rewrite': new URL('/index.md', request.url).toString(),
        'Vary': 'Accept',
      },
    });
  }
}

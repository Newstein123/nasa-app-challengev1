import { createFileRoute } from '@tanstack/react-router'
import { resolveName } from '../../server/resolve'

export const Route = createFileRoute('/api/resolve')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const name = new URL(request.url).searchParams.get('name')?.trim() ?? ''
        if (!name || name.length > 100) {
          return Response.json({ status: 'error', message: 'Give an object name of 1–100 characters.' }, { status: 400 })
        }
        try {
          const pos = await resolveName(name)
          if (!pos) return Response.json({ status: 'not-found', message: `Could not resolve “${name}” with CDS Sesame` }, { status: 404 })
          return Response.json({ status: 'ok', ...pos })
        } catch (e) {
          return Response.json({ status: 'error', message: (e as Error).message }, { status: 502 })
        }
      },
    },
  },
})

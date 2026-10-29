import { createFileRoute } from '@tanstack/react-router'
import { measurePoint } from '../../server/analysis'
import { formatZodError, measureBodySchema } from '../../server/validate'

// POST { ra, dec, urls[] } → per-file quick-look measurement at that position.
export const Route = createFileRoute('/api/measure')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = measureBodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
          return Response.json({ status: 'error', kind: 'bad-request', message: formatZodError(parsed.error) }, { status: 400 })
        }
        const { ra, dec, urls } = parsed.data
        const measurements = await Promise.all(urls.map((u) => measurePoint(u, ra, dec)))
        return Response.json({ status: 'ok', measurements })
      },
    },
  },
})

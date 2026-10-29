import { createFileRoute } from '@tanstack/react-router'
import { visitImage } from '../../server/analysis'
import { OffDetectorError } from '../../server/spherexFile'
import { formatZodError, visitQuerySchema } from '../../server/validate'

// GET ?url&ra&dec[&n&scale] → one exposure resampled onto a north-up grid around (ra, dec).
export const Route = createFileRoute('/api/visit')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const parsed = visitQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
        if (!parsed.success) {
          return Response.json({ status: 'error', kind: 'bad-request', message: formatZodError(parsed.error) }, { status: 400 })
        }
        const { url, ra, dec, n, scale } = parsed.data
        try {
          const image = await visitImage(url, ra, dec, n, scale)
          return Response.json({ status: 'ok', image }, { headers: { 'Cache-Control': 'public, max-age=3600' } })
        } catch (e) {
          const offImage = e instanceof OffDetectorError
          return Response.json(
            { status: 'error', kind: offImage ? 'off-image' : 'upstream', message: (e as Error).message },
            { status: offImage ? 422 : 502 },
          )
        }
      },
    },
  },
})

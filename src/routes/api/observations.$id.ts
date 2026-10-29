import { createFileRoute } from '@tanstack/react-router'
import { getObservation } from '../../server/sia'
import { collectionFromDid } from '../../server/validate'

// :id is the URL-encoded IVOA publisher DID of a SPHEREx product.
export const Route = createFileRoute('/api/observations/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const did = decodeURIComponent(params.id)
        const collection = collectionFromDid(did)
        if (!collection) {
          return Response.json(
            { status: 'error', kind: 'bad-request', message: 'id must be a SPHEREx publisher DID (ivo://irsa.ipac/spherex_…)', retryable: false },
            { status: 400 },
          )
        }
        const result = await getObservation(did, collection)
        const httpStatus =
          result.status === 'ok' ? 200 : result.status === 'not-found' ? 404 : result.kind === 'timeout' ? 504 : 502
        return Response.json(result, { status: httpStatus })
      },
    },
  },
})

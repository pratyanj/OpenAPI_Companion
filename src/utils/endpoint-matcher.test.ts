import { describe, it, expect } from 'vitest'
import { matchEndpointFromCurl } from './endpoint-matcher'
import { parseCurl } from './curl-parser'
import type { EndpointListItem } from '@/modules/productivity/types'

describe('endpoint-matcher', () => {
  const endpoints: EndpointListItem[] = [
    {
      endpointId: 'get /tasks/',
      method: 'get',
      path: '/tasks/',
      summary: 'List tasks',
      tags: ['tasks'],
      favorite: false,
    },
    {
      endpointId: 'post /tasks/',
      method: 'post',
      path: '/tasks/',
      summary: 'Create task',
      tags: ['tasks'],
      favorite: false,
    },
    {
      endpointId: 'get /tasks/{task_id}',
      method: 'get',
      path: '/tasks/{task_id}',
      summary: 'Get task by ID',
      tags: ['tasks'],
      favorite: false,
    },
    {
      endpointId: 'put /tasks/{task_id}',
      method: 'put',
      path: '/tasks/{task_id}',
      summary: 'Update task',
      tags: ['tasks'],
      favorite: false,
    },
    {
      endpointId: 'delete /tasks/{task_id}',
      method: 'delete',
      path: '/tasks/{task_id}',
      summary: 'Delete task',
      tags: ['tasks'],
      favorite: false,
    },
    {
      endpointId: 'post /tasks/{task_id}/labels/{label_id}',
      method: 'post',
      path: '/tasks/{task_id}/labels/{label_id}',
      summary: 'Attach label to task',
      tags: ['tasks'],
      favorite: false,
    },
  ]

  it('matches exact literal endpoints', () => {
    const curl = parseCurl(`curl "http://127.0.0.1:8008/tasks/"`)
    const match = matchEndpointFromCurl(curl, endpoints)

    expect(match).not.toBeNull()
    expect(match?.endpointId).toBe('get /tasks/')
    expect(match?.pathParams).toEqual({})
  })

  it('matches templated path and extracts path parameters', () => {
    const curl = parseCurl(`curl "http://127.0.0.1:8008/tasks/42"`)
    const match = matchEndpointFromCurl(curl, endpoints)

    expect(match).not.toBeNull()
    expect(match?.endpointId).toBe('get /tasks/{task_id}')
    expect(match?.pathParams).toEqual({ task_id: '42' })
  })

  it('matches correct HTTP method for same path template', () => {
    const putCurl = parseCurl(`curl -X PUT "http://127.0.0.1:8008/tasks/42" -d '{"done":true}'`)
    const putMatch = matchEndpointFromCurl(putCurl, endpoints)
    expect(putMatch?.endpointId).toBe('put /tasks/{task_id}')

    const deleteCurl = parseCurl(`curl -X DELETE "http://127.0.0.1:8008/tasks/42"`)
    const deleteMatch = matchEndpointFromCurl(deleteCurl, endpoints)
    expect(deleteMatch?.endpointId).toBe('delete /tasks/{task_id}')
  })

  it('matches multi-parameter nested routes', () => {
    const curl = parseCurl(`curl -X POST "http://127.0.0.1:8008/tasks/100/labels/5"`)
    const match = matchEndpointFromCurl(curl, endpoints)

    expect(match).not.toBeNull()
    expect(match?.endpointId).toBe('post /tasks/{task_id}/labels/{label_id}')
    expect(match?.pathParams).toEqual({
      task_id: '100',
      label_id: '5',
    })
  })

  it('matches paths with prefixes (e.g. /api/v1/tasks/42)', () => {
    const curl = parseCurl(`curl "http://localhost:8008/api/v1/tasks/42"`)
    const match = matchEndpointFromCurl(curl, endpoints)

    expect(match).not.toBeNull()
    expect(match?.endpointId).toBe('get /tasks/{task_id}')
    expect(match?.pathParams).toEqual({ task_id: '42' })
  })

  it('returns null when no matching endpoint exists', () => {
    const curl = parseCurl(`curl "http://127.0.0.1:8008/non-existent-route"`)
    const match = matchEndpointFromCurl(curl, endpoints)
    expect(match).toBeNull()
  })
})

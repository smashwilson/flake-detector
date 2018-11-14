import nock from 'nock'
import dedent from 'dedent'

import flakeDetector from '../src'
import { Probot } from 'probot'

nock.disableNetConnect()

describe('Flake Detector', () => {
  let probot: any

  beforeEach(() => {
    probot = new Probot({ id: 123, cert: 'test' })
    const app = probot.load(flakeDetector)
    app.app = () => 'test'
  })

  test('stores metadata when a check run reports a failing test', async () => {
    const expectedMetadata = {
      failures: {
        deadbeef: [
          {
            path: 'test number 1',
            message: 'message 1',
            raw_details: 'raw 1',
            details_url: 'https://ci.that.doesnt.suck/builds/7'
          },
          {
            path: 'test number 2',
            message: 'message 2',
            raw_details: 'raw 2',
            details_url: 'https://ci.that.doesnt.suck/builds/7'
          }
        ]
      }
    }

    const n = nock('https://api.github.com')
      .get('/repos/owner/repo/check-runs/100/annotations')
      .reply(200, JSON.stringify([
        { path: 'test number 1', message: 'message 1', raw_details: 'raw 1', annotation_level: 'failure' },
        { path: 'test number 2', message: 'message 2', raw_details: 'raw 2', annotation_level: 'failure' },
        { path: 'idk why this is here', message: 'no', raw_details: 'no', annotation_level: 'warning' }
      ]))
      .get('/repos/owner/repo/pulls/6')
      .reply(200, JSON.stringify({
        body: 'this is the existing pull request body'
      }))
      .patch('/repos/owner/repo/pulls/6', (body: any) => {
        expect(body).toMatchObject({
          body: dedent`
            this is the existing pull request body

            <!-- probot = ${JSON.stringify(expectedMetadata)} -->
          `
        })
      })
      .reply(200)

    await probot.receive({
      name: 'check_run',
      payload: {
        action: 'completed',
        check_run: {
          name: 'oh no',
          status: 'completed',
          conclusion: 'failure',
          details_url: 'https://ci.that.doesnt.suck/builds/7',
          output: { annotations_url: 'https://api.github.com/repos/owner/repo/check-runs/100/annotations' },
          head_sha: 'deadbeef',
          pull_requests: [ { number: 6 } ]
        }
      }
    })

    expect(n.isDone()).toBeTruthy();
  })

  test.skip('adds a comment when a check run has identified a potential flake', () => {})

  test.skip('omits a potential flake that already has an issue created', () => {})

  test.skip('creates an issue when a potential flake has been accepted', () => {})

  test.skip('declines to create an issue for a potential flake when one already exists', () => {})
})

import * as core from '@actions/core'
import axios, {isAxiosError} from 'axios'
import * as https from 'https'

async function run(): Promise<void> {
  try {
    // Input from the GitHub Action.
    // Currently only supports the endpoint as well as whether to skip TLS verification.
    const endpoint: string = core.getInput('endpoint', {required: true})
    const parsedURL = new URL(`${endpoint}/v1/auth/m2m/exchange`)
    const skipTLSVerify = Boolean(core.getInput('skip-tls-verify'))
    const agent = new https.Agent({rejectUnauthorized: !skipTLSVerify})

    core.info(`Attempting to obtain an access token for Central ${endpoint}...`)

    // Retrieve an ID token from GitHub's OIDC.
    const idToken: string = await core.getIDToken()

    // Exchange the ID token from GitHub for a Rox token for Central access.
    const exchangeTokenRequest = {
      id_token: idToken
    }
    const response = await axios.post(
      parsedURL.toString(),
      JSON.stringify(exchangeTokenRequest),
      {httpsAgent: agent}
    )

    core.info(
      `Received status ${
        response.status
      } from endpoint ${parsedURL.toString()}: ${JSON.stringify(response.data)}`
    )

    core.info(`Successfully obtained an access token for central ${endpoint}!`)

    // Expose the API token we received from Central as environment variable for other jobs to use.
    // Mark this environment variable as secret, so it will be obfuscated in output.
    core.exportVariable('ROX_API_TOKEN', response.data['accessToken'])
    core.setSecret('ROX_API_TOKEN')

    // Additionally, also set the Central API endpoint as environment variable for other jobs to use.
    // This does not need to be marked as a secret.
    core.exportVariable('ROX_ENDPOINT', parsedURL.toString())

    core.info(
      'Successfully set the variable ROX_API_TOKEN and ROX_ENDPOINT to the access token and ' +
        'Central API endpoint!'
    )
  } catch (error) {
    core.info(`${error}`)
    if (isAxiosError(error)) {
      core.setFailed(
        `Failed to exchange token: HTTP Status: ${
          error?.response?.status
        } Response: ${JSON.stringify(error?.response?.data)}`
      )
    } else if (error instanceof Error) core.setFailed(error.message)
  }
}

run()

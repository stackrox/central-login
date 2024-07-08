import * as core from '@actions/core'
import axios, {isAxiosError} from 'axios'
import axiosRetry, {isNetworkError, isRetryableError} from 'axios-retry';

import * as https from 'https'

axiosRetry(axios, {
  retries: 3,
  retryDelay: retryCount => {
    core.info(`HTTP request retry attempt: ${retryCount}`)
    return retryCount * 2000
  },
  retryCondition: error => {
    core.warning(error)
    return isNetworkError(error) || isRetryableError(error)
  }
})

async function run(): Promise<void> {
  // Input from the GitHub Action.
  // Currently only supports the endpoint as well as whether to skip TLS verification.
  const endpoint: string = core.getInput('endpoint', {required: true})
  const parsedURL = new URL(`${endpoint}/v1/auth/m2m/exchange`)
  const skipTLSVerify = Boolean(core.getInput('skip-tls-verify'))
  try {
    core.info(`Attempting to obtain an access token for Central ${endpoint}...`)

    const accessToken = await obtainAccessToken(parsedURL, skipTLSVerify)

    core.info(`Successfully obtained an access token for central ${endpoint}!`)

    // Expose the API token we received from Central as environment variable for other jobs to use.
    // Mark this environment variable as secret, so it will be obfuscated in output.
    core.exportVariable('ROX_API_TOKEN', accessToken)
    core.setSecret('ROX_API_TOKEN')

    // Additionally, also set the Central API endpoint as environment variable for other jobs to use.
    // This does not need to be marked as a secret.
    // The HTTPS scheme has to be stripped, as this is not expected to be set by roxctl for the endpoint.
    core.exportVariable('ROX_ENDPOINT', getHostWithPort(parsedURL))

    core.info(
      'Successfully set the variable ROX_API_TOKEN and ROX_ENDPOINT to the access token and ' +
        'Central API endpoint!'
    )
  } catch (error) {
    core.info(`${error}`)
    if (isAxiosError(error)) {
      core.setFailed(
        `Failed to exchange token: HTTP Status: ${error?.response
          ?.status} Response: ${JSON.stringify(error?.response?.data)}`
      )
    } else if (error instanceof Error) core.setFailed(error.message)
  }
}

async function obtainAccessToken(
  endpoint: URL,
  skipTLSVerify: boolean
): Promise<string> {
  const agent = new https.Agent({rejectUnauthorized: !skipTLSVerify})

  // Retrieve an ID token from GitHub's OIDC.
  const idToken: string = await core.getIDToken()

  // Exchange the ID token from GitHub for a Rox token for Central access.
  const exchangeTokenRequest = {
    id_token: idToken
  }
  const response = await axios.post(
    endpoint.toString(),
    JSON.stringify(exchangeTokenRequest),
    {httpsAgent: agent, headers: { 'User-Agent': 'central-login-GHA'}},
  )

  core.info(
    `Received status ${
      response.status
    } from endpoint ${endpoint.toString()}: ${JSON.stringify(response.data)}`
  )

  return response.data['accessToken']
}

function getHostWithPort(url: URL): string {
  let host = url.host
  // If the port is not given, assume HTTPs and port 443 (the port will be omitted if HTTPS is used as scheme _and_
  // the port is the default 443 port).
  if (url.port === '') {
    host = `${host}:443`
  }
  return host
}

run()

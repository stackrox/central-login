import * as core from '@actions/core';
import axios, {isAxiosError} from 'axios';
import isRetryAllowed from 'is-retry-allowed';

import * as https from 'https'

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
  
  const response = await postWithRetries(
    agent,
    endpoint,
    JSON.stringify(exchangeTokenRequest),
    3,
    2000,
  );

  return response
}

async function postWithRetries(
  agent: https.Agent,
  endpoint: URL,
  payload: string,
  maxRetries: number = 3,
  baseDelay: number = 2000
): Promise<string> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        core.info(`HTTP request retry attempt: ${attempt}`)
        const delay = baseDelay * attempt;
        await new Promise( (resolve) => setTimeout(resolve, delay) );
      }
      const result = await axios.post(
        endpoint.toString(),
        payload,
        {httpsAgent: agent, headers: { 'User-Agent': 'central-login-GHA'}},
      );

      core.info(
        `Received status ${
          result.status
        } from endpoint ${endpoint.toString()}`
      )

      return result.data['accessToken'];
    } catch (error: any) {
      lastError = error;
      if (isRetryableError(error) && attempt < maxRetries) {
        continue;
      }
      return Promise.reject(error);
    }
  }
  return Promise.reject(lastError);
}

function isRetryableError(error: any): boolean {
  core.warning(error);
  if (error.code === 'ECONNABORTED') {
    return false;
  }
  if (!error.response) {
    return true;
  }
  const errorStatus = error.response.status;
  if (errorStatus === 429) {
    return true;
  }
  if (errorStatus >= 500 && errorStatus <= 599) {
    return true;
  }
  return isRetryAllowed(error);
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

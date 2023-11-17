# Central Login GitHub Action

![E2E tests](https://github.com/stackrox/central-login/actions/workflows/e2e.yml/badge.svg)

Configure your Central login credentials for use in other GitHub Actions.

This action obtains an access token to
a [Red Hat Advanced Cluster Security (ACS)](https://www.redhat.com/en/technologies/cloud-computing/openshift/advanced-cluster-security-kubernetes)
Central instance and configures environment variables for your
other actions to use.

This is as simple as adding the following step to your workflow:

```yaml
    - name: Central Login
      uses: stackrox/central-login@v1
      with:
        endpoint: https://<central-endpoint>:443
```

## Parameters

| Parameter name    | Required?      | Description                                                      |
|-------------------|----------------|------------------------------------------------------------------|
| `endpoint`        | **(required)** | API endpoint of the ACS Central instance.                        |
| `skip-tls-verify` | (optional)     | Skip TLS certificat verification for ACS Central's API endpoint. |

## Overview

It is currently only supported to retrieve credentials by
using [GitHub's OIDC provider](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-cloud-providers).

With [GitHub's OIDC provider](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-cloud-providers),
this action will be issued with an ID token unique to this workflow run, which will then
be exchanged for a ACS Central access token.

For creating the ID
token, [it is required for your workflow to have the `id-token: write` permission](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-cloud-providers#adding-permissions-settings):

```yaml
permissions:
  id-token: write # This is required for requesting the JWT
```

### Sample Central configuration

Before being able to exchange tokens, the ACS Central instance needs to be configured to allow exchanging tokens
originating from GitHub Action workflow runs.

At the current time, this only works via API, see the sample configuration below:

```bash
curl \
  https://<central-endpoint>/v1/auth/m2m \
  -d  @- << EOF
  {
    "config": {
      "type": "GITHUB_ACTIONS",
      "tokenExpirationDuration": "5m", // This can be used to specify the expiration of the exchanged access token.
      "mappings": [ // Mappings configure which token claims to map to which roles within the ACS Central instance.
        {
          "key": "sub",
          "valueExpression": "repo:octo-org/octo-repo.*", // This supports https://github.com/google/re2/wiki/Syntax expressions.
          "role": "Continuous Integration"
        }
      ],
    }
  }
  EOF
```

**Recommendations**

- For specifics on the claim values on the ID tokens issued by GitHub's OIDC
  provider, [check out this documentation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect#understanding-the-oidc-token).
- Make sure to map claim values _specific_ to your repository. It is recommended to use the `sub` claim for that.
  For more information about the subject claim's structure for tokens issued by GitHub's OIDC
  provider, [check out this documentation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect#example-subject-claims).

## Using this action in your workflow

After the ACS Central instance has been configured to allow exchanging tokens from GitHub Action workflow runs, you can
add the following step to your workflow:

```yaml
    - name: Central Login
      uses: stackrox/central-login@v1
      with:
        endpoint: https://<central-endpoint>:443
```

After the central login step has succeeded, the following environment variables are configured for other steps to use:

- `ROX_API_TOKEN` which contains the exchanged access token for the ACS Central instance.
- `ROX_ENDPOINT` which contains the ACS Central instance endpoint correlated with the access token.

For verifying everything works correctly, the example below can be used:

```yaml
    - name: Central Login
      uses: stackrox/central-login@v1
      with:
        endpoint: https://<central-endpoint>:443

    - name: roxctl central whoami
      image: quay.io/stackrox-io/roxctl:4.3.0
      script: central whoami
```

This will output the specifics about the access token (i.e. it's associated permissions and roles) as well as the
originating user.

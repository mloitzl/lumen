---
title: Getting an App Only access token for SharePoint REST APIs
date: "2023-03-13T11:11:11.000Z"
template: "post"
draft: false
slug: "/posts/getting-an-app-only-access-token-for-sharepoint-rest-apis"
category: "sharepoint"
tags:
- "sharepoint"
- "m365"
- "azure"
description: "The SharePoint API only accepts access (bearer) tokens that have been acquired using client assertions. This article explains how to do that on protcol level."
socialImage: "./pexels-pavel-danilyuk-8438966.jpg"
---


![Photo by Pavel Danilyuk: https://www.pexels.com/photo/robot-holding-a-red-flower-8438966/](./pexels-pavel-danilyuk-8438966.jpg)

# Objectives

Recently I was asked to access SharePoint Online APIs using App Only access.
I always used libraries (like MSAL, or PnP Core) for that and they always use signed client assertions for acquiring bearer tokens.


This time I needed some deeper insights and analyzed the whole process on protocol level.

# App Registration

As a pre-requisite we need an Azure Active Directory App registration with access to SharePoint. There are plenty of guides on the net for that, for example [Setup Authentication](/posts/creating-sharePoint-managed-metadata-terms-using-the-new-pnp-core-sdk/#setup-authentication).

In short, I used `openssl` to create self-signed certificates...

```bash
# Create the certificate
$ openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365  
# Convert to pfx file
$ openssl pkcs12 -export -out certificate.pfx -inkey key.pem -in cert.pem
```

...and the [PnP PowerShell](https://pnp.github.io/powershell/index.html) cmdlet [Register-PnPAzureADApp](https://pnp.github.io/powershell/cmdlets/Register-PnPAzureADApp.html) to create the Azure AD app registration.

```ps
Register-PnPAzureADApp `
  -ApplicationName TestApp1 `
  -Tenant <tenant>.onmicrosoft.com `
  -CertificatePath certificate.pfx `
  -CertificatePassword (ConvertTo-SecureString -String "<cert password>" -AsPlainText -Force) `
  -Username "<user>@<tenant>.onmicrosoft.com" `
  -Password (ConvertTo-SecureString -String "<password>" -AsPlainText -Force) `
  -SharePointApplicationPermissions Sites.Read.All
```

# Getting an OAuth2 Token using a Client Assertion

The Request for getting the app only access token looks like this:

```http
POST https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/token
Content-Type: application/x-www-form-urlencoded

client_id=<client-id>
&grant_type=client_credentials
&scope=https://<tenant>.sharepoint.com/.default
&client_assertion=<signed jwt client assertion>
&client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer
```

The `tenant-id` is the id of the Azure AD tenant, `client-id` the app id of the Azure AD App registration. The grant type is set to `client_credentials`. 

The scope needs to be set to the SharePoint URL, followed by `.default`.

The client assertion type is set to [`jwt-bearer`](https://www.rfc-editor.org/rfc/rfc7523#section-8), and the client assertion itself a base64 jwt similar to...

```json
{
  "iat": 1678548857,
  "exp": 1678552457,
  "iss": "791ff0ac-1f93-47fc-8629-6b20f360036f",
  "sub": "791ff0ac-1f93-47fc-8629-6b20f360036f",
  "aud": "https://login.microsoftonline.com/0a7ab993-afa3-4a29-9b0b-f64583a4d888/oauth2/token"
}
```

...signed with the private key of the certificate provided to the Azure AD App registration.

The jwt contains the following claims:

- "iat": Issued at timestamp
- "exp": Expires timestamp - time window, as short as possible
- "iss": Issuer - the App Id
- "sub": Subject Claim - also the App Id
- "aud": Audience - the token endpoint

This is quite hard to do with command line tools, fortunately there is a handy npm package that does all that in one step:

## The `jwtgen` Tool

```bash
$ jwtgen -a RS256 \
         -p key.pem \
         -e 3600 \
         -c "iss=<client-id>" \
         -c "sub=<client-id>" \
         -c "aud=https://login.microsoftonline.com/<tenant-id>/oauth2/token"  \
         --headers "{\"typ\":\"JWT\",\"alg\":\"RS256\",\"x5t\":\"<base64-encoded-certificate-thumbprint>\"}" \
         -v
```

Note that the certificate thumbprint `<base64-encoded-certificate-thumbprint>` usually comes in a hexadecimal representatation, e.g. `49AF595AE9C628BCAF5AB9D36B4EEC97DFF24458`

Sites like [Base64.guru](https://base64.guru/converter/encode/hex) or [this CyberChef recipe](https://gchq.github.io/CyberChef/#recipe=From_Hex('Auto')To_Base64('A-Za-z0-9%2B/%3D')&input=NDlBRjU5NUFFOUM2MjhCQ0FGNUFCOUQzNkI0RUVDOTdERkYyNDQ1OA) can be used to get the correct base 64 encoded representation of the certificate thumbprint: `Sa9ZWunGKLyvWrnTa07sl9/yRFg=`

## Everything put together

```bash
$ jwtgen -a RS256 \
         -p key.pem \
         -e 3600 \
         -c "iss=791ff0ac-1f93-47fc-8629-6b20f360036f" \
         -c "sub=791ff0ac-1f93-47fc-8629-6b20f360036f" \
         -c "aud=https://login.microsoftonline.com/0a7ab993-afa3-4a29-9b0b-f64583a4d888/oauth2/token"  \
         --headers "{\"typ\":\"JWT\",\"alg\":\"RS256\",\"x5t\":\"Sa9ZWunGKLyvWrnTa07sl9/yRFg=\"}" \
         -v
```

The `-v` commandline option produces verbose output including the encoded claims, headers and the token:

```bash
algorithm: RS256

claims:
{
  "iat": 1678549167,
  "exp": 1678552767,
  "iss": "791ff0ac-1f93-47fc-8629-6b20f360036f",
  "sub": "791ff0ac-1f93-47fc-8629-6b20f360036f",
  "aud": "https://login.microsoftonline.com/0a7ab993-afa3-4a29-9b0b-f64583a4d888/oauth2/token"
}

headers:
{
  "typ": "JWT",
  "alg": "RS256",
  "x5t": "Sa9ZWunGKLyvWrnTa07sl9/yRFg="
}

token:
eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsIng1.... many more characters
```

Using the client assertion - shown in the token field - we can now try to request a token from the aouth2 token endpoint:

```http
POST https://login.microsoftonline.com:443/0a7ab993-afa3-4a29-9b0b-f64583a4d888/oauth2/v2.0/token
Content-Type: application/x-www-form-urlencoded

client_id=791ff0ac-1f93-47fc-8629-6b20f360036f
&grant_type=client_credentials
&scope=https://loitzl.sharepoint.com/.default
&client_assertion=eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsIng1......
&client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer
```

Et voilà, we (hopefully) got a valid `access_token` in the response:

```js
{
  "token_type": "Bearer",
  "expires_in": 3599,
  "ext_expires_in": 3599,
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsIng1d...."
}
```

Lets try this by...

# Getting all Lists from a SharePoint Site using the REST API

Using the token requested using a client assertion we can now try to get all lists from my SharePoint root site:

```http
GET https://loitzl.sharepoint.com/_api/web/lists
Accept: application/json;odata=verbose
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOi....
````

The result: the first couple of fields of the `/lists` request.

```js
{
  "d": {
    "results": [
      {
        "__metadata": {
          "id": "https://loitzl.sharepoint.com/_api/Web/SiteUserInfoList",
          "uri": "https://loitzl.sharepoint.com/_api/Web/SiteUserInfoList",
          "etag": "\"82\"",
          "type": "SP.List"
        },
        "FirstUniqueAncestorSecurableObject": {
[...]
```

✅ Yess!

# Using a client secret

My IT department asked me if it's possible to use a client secret instead, so I tried this as well.

The token endpoint request:

```http
POST https://login.microsoftonline.com:443/0a7ab993-afa3-4a29-9b0b-f64583a4d888/oauth2/v2.0/token
Content-Type: application/x-www-form-urlencoded

client_id=791ff0ac-1f93-47fc-8629-6b20f360036f
&grant_type=client_credentials
&scope=https://loitzl.sharepoint.com/.default
&client_secret=tdB8Q....
```

returns an access token as well:

```js
{
  "token_type": "Bearer",
  "expires_in": 3599,
  "ext_expires_in": 3599,
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJS...."
}
```

If we use that token on the SharePoint REST API...

```http
GET https://loitzl.sharepoint.com/_api/web/lists
Accept: application/json;odata=verbose
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSU...
```

...it replies with an "401 Unauthorized":

```
Unsupported app only token.
```

## Structure of the Bearer Token

The bearer token acquired with a client assertion contains an `appidacr` claim with a value of `2`, the client secret acquired token has an `appidacr` value of `1`. 

![ClientAssertion vs ClientSecret Token](./ClientAssertion-vs-ClientSecret-Token.png)

I reckon that SharePoint uses this value to distinguish if the endpoint accepts the token or not.

# Conclusion

In my opinion signed client assertions are a more secure method for getting bearer tokens than using client secrets (regardless of SharePoint).

If someone gets hold of the client secret in transport, the window of compromise is as long as the validity duration of the client secret (thus keep them as short as possible).

But if we lose a client assertion in transport, its only valid for the requested duration, probably just a couple of minutes or even seconds.

Nevertheless, we need to handle the certificate, which is another topic.

> 💙

### References

- Azure AD Token Generation using a Certificate Secret Client Credentials Flow. [Philip Harding](https://gist.github.com/phillipharding/d6cc4b84221cf5304e41d97beb62ea6c) 
- Doing the same thing in .Net Core. [Waldek Mastykarz](https://blog.mastykarz.nl/azure-ad-app-only-access-token-using-certificate-dotnet-core/) 
- [Photo by Pavel Danilyuk](https://www.pexels.com/photo/robot-holding-a-red-flower-8438966/)
- [JSON Web Token (JWT) Profile for OAuth 2.0 Client Authentication and Authorization Grants](https://www.rfc-editor.org/rfc/rfc7523)
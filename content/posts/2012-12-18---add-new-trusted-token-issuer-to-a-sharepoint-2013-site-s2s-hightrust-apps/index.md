---
title: Add new Trusted Token Issuer to a SharePoint 2013 Site – S2S HighTrust Apps
date: "2012-12-18T22:40:32.169Z"
template: "post"
draft: false
slug: "/posts/add-new-trusted-token-issuer-to-a-sharepoint-2013-site-s2s-hightrust-apps"
category: "sharepoint"
tags:
  - "sharepoint"
  - "addins"
description: ""
socialImage: "./image.jpg"
---


For SharePoint 2013 App Development on-premise, there might not be a Cloud ACS around to get the token stuff done. For this case the App must create its own access tokens and SharePoint 2013 must know about them as Trusted Security Token Issuers. The App creates a token (with the users credentials) and signs it with its own private key. If the SharePoint 2013 Site hosting the app knows about the IssuerID, the Server can extract the token and grant access.

The whole process is described in [How to: Create high-trust apps for SharePoint 2013 using the server-to-server protocol (advanced topic)](https://docs.microsoft.com/en-us/sharepoint/dev/sp-add-ins/create-high-trust-sharepoint-add-ins?redirectedfrom=MSDN). Note that there is a difference between SharePoint Developer Tools Preview and Preview 2.

Based on [Andrew Connell’s](https://www.andrewconnell.com/blog/Registering-SP2013-High-Trust-Apps-Using-S2S-the-Easy-Way/) Script for the Beta and RTM Version, I composed a little powershell script that streamlines the registration, since this has to be done for every App. All that is needed is a developer site and a private certificate.

> <strong>Update:</strong> The flag –IsTrustBroker in New-SPTrustedSecurityTokenIssuer makes the certificate reusable. So several apps can share the same certificate ussing the same issuer ID. [[0]](https://docs.microsoft.com/en-us/archive/blogs/speschka/more-troubleshooting-tips-for-high-trust-apps-on-sharepoint-2013) – Bullet: Token issuer not configured as trust broker.

```powershell
# ———————————————————————————
# Setup for a new Trusted Security Token Issuer for an on-prem Developer Hosted App
# $TargetUrl = Developer SiteCollection Url
# $publicCertPath = Path to the public part of the certificate
# (optional) $issuerID = Unique ID for the App, generated if omitted
#
# e.g. .\AddTrustedTokenIssuerToSite “http://developerSite/” “c:\PathTo.Cer”
#
# The isserID is printed at the end of the script -> keep it for
# the App’s web.config
# ———————————————————————————

param(
[string]$TargetUrl,
[string]$publicCertPath,
[string]$issuerID = “”
)

Write-Host
Write-Host “Register new Trusted Identity Token Issuer…” -ForegroundColor White
Write-Host ” Script Steps:” -ForegroundColor White
Write-Host ” (1 of 5) Validating parameters…” -ForegroundColor White
Write-Host ” (2 of 5) Verify SharePoint PowerShell Snapin Loaded” -ForegroundColor White
Write-Host ” (3 of 5) Check if site collection exists at target $SiteUrl” -ForegroundColor White
Write-Host ” (4 of 5) Adding IssuerIdentifier at target $SiteUrl” -ForegroundColor White
Write-Host ” (5 of 5) Verify OAuth over https is disabled” -ForegroundColor White
Write-Host

# ———————————————–

# verify parameters passed in
Write-Host “(1 of 5) Validating parameters…” -ForegroundColor White
if ($TargetUrl -eq $null -xor $TargetUrl -eq “”) {
  Write-Error ‘$TargetUrl is required’
  Exit
}
if ($publicCertPath -eq $null -xor $publicCertPath -eq “”) {
  Write-Error ‘$publicCertPath is required’
  Exit
}
Write-Host ” All parameters valid” -ForegroundColor Gray

# ———————————————–

if ($issuerID -eq $null -xor $issuerID -eq “”) {
  Write-Host ‘ IssuerID is empty, generating’
  $issuerID = [System.Guid]::NewGuid().ToString()
}

# ———————————————–

# Load SharePoint PowerShell snapin
Write-Host
Write-Host “(2 of 5) Verify SharePoint PowerShell Snapin Loaded” -ForegroundColor White
$snapin = Get-PSSnapin | Where-Object {$_.Name -eq ‘Microsoft.SharePoint.PowerShell’}
if ($snapin -eq $null) {
  Write-Host ” .. loading SharePoint PowerShell Snapin…” -ForegroundColor Gray
  Add-PSSnapin “Microsoft.SharePoint.PowerShell”
}
Write-Host ” Microsoft SharePoint PowerShell snapin loaded” -ForegroundColor Gray

# ———————————————–

Write-Host
Write-Host “(3 of 5) Check if site collection exists at target $TargetUrl” -ForegroundColor White
$targetSpSite = Get-SPSite $TargetUrl
if ($targetSpSite -ne $null) {
  Write-Host ” … site found” -ForegroundColor Gray

  $realm = Get-SPAuthenticationRealm -ServiceContext $targetSpSite
  $certificate = Get-PfxCertificate $publicCertPath
  $fullIssuerIdentifier = $issuerId + ‘@’ + $realm

  Write-Host
  Write-Host “(4 of 5) Adding IssuerIdentifier $fullIssuerIdentifier ” -ForegroundColor White
  Write-Host ” as TrustedSecurityTokenIssuer to $TargetUrl” -ForegroundColor White

  $result = New-SPTrustedSecurityTokenIssuer -Name $issuerId -Certificate $certificate -RegisteredIssuerName $fullIssuerIdentifier –IsTrustBroker

  Write-Host
  write-host “— ### Results ### —” -ForegroundColor Green
  write-host ” Realm: $realm” -ForegroundColor Green
  # write-host “FullIssuerID: $fullIssuerIdentifier” -ForegroundColor Green
  write-host ” IssuerID: $issuerId” -ForegroundColor Green
  write-host ” Result: $result” -ForegroundColor Green
  write-host “— ### Results ### —” -ForegroundColor Green
}
else
{
  Write-Error “$TargetUrl not found”
  Exit
}

Write-Host
Write-Host “(5 of 5) Verify OAuth over https is disabled” -ForegroundColor White
$serviceConfig = Get-SPSecurityTokenServiceConfig
if($serviceConfig.AllowOAuthOverHttp -ne $true) {
    $serviceConfig.AllowOAuthOverHttp = $true
    $serviceConfig.Update()
    write-host ‘ OAuth over https disabled’ -ForegroundColor Green
}
else
{
  write-host ‘ OAuth over https is already disabled’ -ForegroundColor White
}
```
0: [More TroubleShooting Tips for High Trust Apps on SharePoint 2013](https://docs.microsoft.com/en-us/archive/blogs/speschka/more-troubleshooting-tips-for-high-trust-apps-on-sharepoint-2013)
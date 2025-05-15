---
title: Export Farm Solution wsp Files SharePoint 2007 and 2010
date: "2012-06-04T22:40:32.169Z"
template: "post"
draft: false
slug: "/posts/export-farm-solution-wsp-files-sharepoint-2007-und-2010"
category: "sharepoint"
tags:
  - "sharepoint"
  - "deployment"
  - "onprem"
description: "Exports all SharePoint Farm Solution Packages (.wsp) from the farm solution store"
socialImage: "/media/Farbverwirrung.jpg"
---

The following PowerShell Snippet exports all SharePoint Farm Solution Packages (.wsp) from the farm solution store. It does work on Windows 2003 R2 with PowerShell 1.0, which I find very practical because it is the standard configuration for WSS3 and MOSS 2007 installations.

```powershell
[System.Reflection.Assembly]::LoadWithPartialName("Microsoft.SharePoint")
$farm = [Microsoft.SharePoint.Administration.SPFarm]::Local
$farm.Solutions | % {
  $filename = ($pwd.ToString() + "\" + $_.SolutionFile.Name);
  write-host ("Saving" + $filename);
  $_.SolutionFile.SaveAs($filename)
}
```


From: [MSDN](https://social.technet.microsoft.com/Forums/en-US/079e2964-348c-4c1d-a227-2aff10a8deeb/export-solutions-wsp-files-to-upgrade-sp-2007-customizations-to-sp-2010?forum=sharepointadminprevious)
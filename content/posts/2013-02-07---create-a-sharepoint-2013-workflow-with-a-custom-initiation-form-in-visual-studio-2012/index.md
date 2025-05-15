---
title: Create a SharePoint 2013 Workflow with a custom Initiation Form in Visual Studio 2012
date: "2013-02-07T22:40:32.169Z"
template: "post"
draft: false
slug: "/posts/create-a-sharepoint-2013-workflow-with-a-custom-initiation-form-in-visual-studio-2012"
category: "sharepoint"
tags:
  - "sharepoint"
  - "workflow"
description: ""
socialImage: "./image.jpg"
---


# Prerequisites

Create a on-prem high trust app as described in my previous blog post.
# Add the Workflow

First of all we need to add a list to host the workflow by adding a new item of type “List” to the SharePoint AppWeb project.

![Add List](./1-Add-List.png)

In a further step, the list could be configured using the new list designer in Visual Studio 2012.

![Add List Designer](./2-Add-List-Designer.png)

Now that we have a list, we can add a workflow to be run on that list by adding a new Item of type “Workflow”to the SharePoint AppWeb project. Set the workflow to start manually and associate it with the previously created list. Select the according items to create a Workflow History And Workflow Tasks List for the Workflow.

![Add Workflow - Set Lists](./3-AddWorkflow-Set-Lists.png)

The new Workflow Designer should now be visible showing a workflow with an empty sequence.

![Workflow Designer](./4-WorkflowDesigner.png)

The custom initiation form will just contain a single string. In order to use that string within the workflow a variable has to be added as input parameter, e.g. “inputString”. To show that the value is actually submitted to the workflow we use a “WriteToLog” Activity that writes the value of our input parameter to the Workflow History List.

![Use Input Parameter in Activity](./5-WorkflowDesigner-Use-Input-Parameter-in-Activity1.png)

The next step is to add a custom Initiation Form by adding a new Item of Type “InitiatonForm” to the Workflow element. This adds a default InitiationForm to the project which is already populated with some code.

![Add Initiation Form](./6-Add-Initiation-Form-Code.png)

Clean up the form to only contain a single text field for our string input variable. In the “startWorkflow” function triggered by the submit button the value of the text field must be added to the params object. It is also necessary to get the List Item ID from the URL, since this is needed as parameter for the “startWorkflowOnListItem” method on the “WorkflowInstance” object.


![Changed Initiation Form](./7-Add-Initiation-Form-Code-changed.png)

The last step is to add a reference to the custom initiation form in the Elements deklaration of the workflow element.

![Initiation Form Elements Declaration](./8-Add-Initiation-Form-Elements-Deklaration.png)


The interesting part here is, that the URL Token replacement does not seem to work properly here as I posted in Apps for SharePoint [MSDN forum](https://social.msdn.microsoft.com/Forums/en-US/d23338c8-255e-4945-8a13-8bcdf0d6e167/2013-workflow-initiation-form-in-remoteappurl?forum=appsforsharepoint). This means that custom initiation and association forms can only be created in the AppWeb and not in the Remote App, which makes more complicated scenarios pretty much bound to javascript/html implementations for now.

After a deploy the ListItem has a workflow associated to it and after starting it manually, the user gets our custom initiation form presented.

![Workflow Form](./9-Run-the-Workflow-The-Form.png)

After the workflow is completed, the workflow history log shows the value entered in  the initiation form.


![Workflow Result](./10-Run-the-Workflow-Result.png)



[2013 Workflow Initiation Form in ~remoteAppUrl](https://social.msdn.microsoft.com/Forums/en-US/d23338c8-255e-4945-8a13-8bcdf0d6e167/2013-workflow-initiation-form-in-remoteappurl?forum=appsforsharepoint)
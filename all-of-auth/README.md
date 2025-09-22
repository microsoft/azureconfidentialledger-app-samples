# Banking application

This is a sample application to demostrate the use of "all of" authentication scheme.
Refer to https://microsoft.github.io/CCF/main/build_apps/js_app_bundle.html for more details 
about the authentication schemes supported in CCF.

## Use case

Use a certificate and a token (JWT) for authentication and authorization.

## What the application does

This application provides a REST API with the following endpoints:

- PUT `/app/logs/{key_op}`
  - write a log entry for the {key_op}. The log entry is supplied in the body.
  - can be invoked by an user (identified by a certificate) with the 'log_writer' role.
  - status code for success: 204

### Scenario in the demo

The app defines a role called the 'log_writer' with permission to write a log entry. The caller
authenticates with a certificate. The app expects a Microsoft Entra ID token to be supplied in the 'Authorization' header.
Up on receiving a request, the app validates the certificate followed by the token using the 'all of' authentication scheme.

### Setup

1. Deploy an Azure confidential ledger instance. (https://learn.microsoft.com/en-us/azure/confidential-ledger/quickstart-portal)

2. Create a certificate with the name log_writer_cert.pem and log_writer_privk.pem

    openssl ecparam -out "log_writer_privk.pem" -name "secp384r1" -genkey
    openssl req -new -key "log_writer_privk.pem" -x509 -nodes -days 365 -out "log_writer_cert.pem" -"sha384" -subj=/CN="log_writer"

3. Obtain a Microsoft Entra ID token (for an Administrator user on the ledger) and copy the raw token.

    az login
    az account get-access-token --resource https://confidential-ledger.azure.com

4. Replace the 'iss', 'aud' and 'tid' values in the 'expectedIssuer', 'expectedAudience' and 'expectedTenant' variables respectively in the code. 
   
    const expectedIssuer = "https://login.microsoftonline.com/<tid>/v2.0"
    const expectedAudience = "<aud>";
    const expectedTenantId = "<tid>";

5. Build and deploy the app.

    # Declare variables
    #
    apiVersion="2024-08-22-preview"
    content_type_application_json="Content-Type: application/json"
    bundle="/home/settiy/azureconfidentialledger-app-samples/all-of-auth/dist/bundle.json"
    content_type_merge_patch_json="Content-Type: application/merge-patch+json"
    authorization="Authorization: Bearer <token>"

    # Build the app
    #
    make build

    # Deploy the application
    #
    curl -k -X PUT "https://myledger.confidential-ledger.azure.com/app/userDefinedEndpoints?api-version=$apiVersion" -H "$content_type_application_json" -H "$authorization" -d @$bundle

    # View the application
    #
    curl -k "https://myledger.confidential-ledger.azure.com/app/userDefinedEndpoints?api-version=$apiVersion" -H "$authorization"

    # Create the role
    # These actions must match (case-sensitive) the values defined in the application.
    #
    role_actions='{"roles":[{"role_name":"log_writer","role_actions":["/logs/write"]}]}'
    curl -k -X PUT "https://myledger.confidential-ledger.azure.com/app/roles?api-version=$apiVersion" -H "$content_type_application_json" -H "$authorization" -d $role_actions

    # View the roles
    #
    curl -k "https://myledger.confidential-ledger.azure.com/app/roles?api-version=$apiVersion" -H "$authorization"

    # Grant the log writer cert an appropriate role and create the user.
    #
    log_writer_cert_fingerprint=$(openssl x509 -in "log_writer_cert.pem" -noout -fingerprint -sha256 | cut -d "=" -f 2)
    log_writer_user="{\"user_id\":\"$log_writer_cert_fingerprint\",\"assignedRoles\":[\"log_writer\"]}"
    curl -k -X PATCH "https://myledger.confidential-ledger.azure.com/app/ledgerUsers/$log_writer_cert_fingerprint?api-version=$apiVersion" -H "$content_type_merge_patch_json" -H "$authorization" -d $log_writer_user

    # View the users
    #
    curl -k "https://myledger.confidential-ledger.azure.com/app/ledgerUsers?api-version=$apiVersion" -H "$authorization"
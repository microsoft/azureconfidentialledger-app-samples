# Insurance sample for ACL

This sample demonstrates the capabilities of ACL to provide transparency and accountability for both the client and a insurance company

## Goals

### Valid decision

A decision to an incident is valid if it is processed by a valid appraiser against a valid policy

### Valid policy

A policy must be valid when the incident is assigned a case number.

### Valid appraiser 

A appraiser must be valid at the time of submission of the decision.

## Roles

### Underwriter
Can add user and policy
Can update appraiser attestation


### Appraiser
Registers with attestation for key
Signs (?) (decision, incidentFingerprint, policyFingerprint) for ledger 

### Auditor
Can read ledger to check that txids from client submission to decision were valid (so checking relevant states)

## Processes

### Appraiser registration
- Appraiser: Submits attestation for signing key
  - ACL: if valid attestation and matches underwriter's, then add as user

### Underwriter appraiser update
- Appraiser: Submit new attestation measurement
  - If attestation has changed, remove the `appraiser` role from all users

### Incident claim

- Client: submits incident fingerprint to ACL, receives back case number, and current policy
  - ACL maps case number to metadata (policy fingerprint and incident fingerprint)
- Client: submits incident, case number and policy to a appraiser container (load balanced and run by insurance company)
- Appraiser: reaches decision, submits to ACL attested: case number, incident and policy fingerprints and decision
  - ACL stores case decision if the processing service and policy is valid, and there has not been a previously submitted decision.
- Client polls for result of decision.

### Claim resolution

Store that client claim has been paid in ledger?

## Design constraints

### Configurable processing service and policy

Endpoint to specify valid processing services and policies.
Currently only one is supported.

### No replay

A client should not be able to submit the same decision multiple times to different processors to reach a favorable decisions.
Provided case number is unique (must manually audit to ensure same incident isn't report multiple times), and at most one decision can be reached per case.
Additionally the client must not control the result of the decision, so the processing service directly contacts ACL.

### Avoid PII in ledger

We should avoid holding any PII in the ledger, since it would be difficult to follow GDPR requests etc.

## Build and run this sample

`npm run build` then upload bundle to ACL via "PUT <url>/app/userDefinedEndpoints?<api-version>".

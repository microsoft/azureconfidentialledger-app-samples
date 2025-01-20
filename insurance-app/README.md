# Insurance sample for ACL

This sample demonstrates the capabilities of ACL to provide transparency and accountability for both the client and a insurance company.

The aim is to offload heavy CPU processing tasks to attested containers.
Since these containers are attested, their processing of decisions can be trusted, even though they are not executed via ACL.

## Processes

```mermaid
sequenceDiagram
  participant Admin
  participant C as Client
  participant A as ACL

  box Gray C-ACI host
    participant P as Processor
    participant S as Attestation Sidecar
  end

  note over Admin,S: Processor registration 

  Admin ->> A: Set valid processor specification

  note over P: Generate key
  P -->> S: Attest(key)
  S -->> P: Attestation
  P ->> A: Register(attestation)

  note over Admin, S: Client registration

  Admin ->> A: Register(client, policy)

  note over Admin, S: Case processing

  C ->> A: RegisterClaim(incident)
  A ->> C: caseId

  loop Poll for available job
  P ->> A: /app/incident/next
  A ->> P: 404 no job
  end
  A ->>+ P: Job(caseId, incident, policy)
  note over P: Use Phi 3 to<br>process job
  P ->>-A: Decision for caseId
  
  loop Poll for Decision
  C <<->> A: 
  end
  A ->> C: Decision for caseId
```

## GDPR considerations
If the incident description is considered PII, then it _cannot_ be stored in the ledger, as it cannot be removed at a later date.
Instead we suggest that users store a fingerprint (SHA-256 hash) of the incident description in the ledger and store the actual description of the incident in a separate database, that the processor then fetches the description from.
This should allow for compliance with the relevant regulations.

## Build and run this sample

### ACL app

- Ensure you have ACL running
  - To run ACL locally in virtual mode:
    - `git clone https://github.com/microsoft/tpal`
    - build with `mkdir build && cd build && CC="clang-15" CXX="clang++-15" cmake -GNinja -DCOMPILE_TARGET=virtual .. && ninja`
    - from the build directory run with `PLATFORM=virtual ../tests/start_network.sh /path/to/ccf_virtual/`
- In `./acl-app` execute `npm run build` and using the admin user certificates upload the bundle to ACL via http `PUT` request to `<acl-url>/app/userDefinedEndpoints?<api-version>`.

There is a unit test in `./acl-app/local-tpal-unit-test.py` which be run with 
```
npm run build && python ./local-tpal-unit-test.py --bundle dist/bundle.json --tpal-tests-directory <tpal>/tests/ --sandbox-common <tpal/build/workspace/sandbox_common
```
This uses a previously captured policy and attested keys to do an end-to-end test.

### C-ACI container

- Ensure you have an azure container repository set up
- Ensure that you have logged into the azure cli via `az login`
- Ensure that you have a hugging face token to download the model
- Build and push to the acr the attestation sidecar
  - `git clone https://github.com/microsoft/confidential-sidecar-containers.git`
  - `cd confidential-sidecar-containers`
  - `docker build -t <acr-name>.azurecr.io/attestation-sidecar -f docker/attestation-container/Dockerfile .`
  - `docker login -u 00000000-0000-0000-0000-000000000000 -p $(az acr login --name <acr-name> --expose-token --output tsv --query accessToken) <acr-name>.azurecr.io`
  - `docker push <acr-name>.azurecr.io/attestation-sidecar`
- Build and deploy using `HUGGINGFACE_TOKEN=<hugging_face_token> bash deploy-aci.sh`

Note: This sample provides ssh access to the container for debugging and exploration.
Production use should remove this and in the `arm-template.json` directly run the python processor

### Testing the sample against a local TPAL 

- Connect and run the processor using ssh
  - `ssh -R 8000:localhost:8000 root@<container-ip> -- python3 /src/acl-processor.py --acl-url localhost:8000 --uds-sock /mnt/uds/sock --prime-phi`
  - As the sample does not currently generate the corresponding policy this will initially fail with the returned policy.
- Amend `./acl-app/c-aci-test.py` to replace the policy with the returned policy
  - TODO do this properly before the test to remove the above step
- In `acl-app` run `npm run build && python ./c-aci-test.py --bundle dist/bundle.json --tpal-tests-directory ~/tpal/tests/ --sandbox-common ~/tpal/build/workspace/sandbox_common/ --setup --add-roles`
  - This sets up the relevant roles and stops with a prompt for a user's policy statement and then their incident that they wish to claim against.
- Connect and rerun the processor
  - `ssh -R 8000:localhost:8000 root@<container-ip> -- python3 /src/acl-processor.py --acl-url localhost:8000 --uds-sock /mnt/uds/sock --prime-phi`
- Enter a test policy and incident
  - TODO fix infinite loop bug, so try to enter a policy such as "This policy covers all car accidents" and incidents like "The policyholder hit a car"

# C-ACI external attested processor for Insurance app

```mermaid
sequenceDiagram
  participant Admin
  participant A as ACL

  box Gray C-ACI host
    participant P as Processor
    participant S as Attestation Sidecar
  end

  Admin ->> A: Set valid processor specification

  note over P: Generate key
  P -->> S: Attest(key)
  S -->> P: Attestation
  P ->> A: Register(attestation)

  loop
  loop Check for available job
  P <<->> A:
  end
  A ->>+ P: Job(incident, policy)
  note over P: Use Phi 3 to<br>process job
  P ->>-A: Decision
  end
```

# Testing the processor locally

`src/test-server.py` runs a basic flask server which serves the endpoints of the ACL app for testing, without any logic behind it.

# C-ACI external attested processor for Insurance app

This container is a barebones proof of concept for the processing container.
It starts up a python server, and upon receiving a processing request should use the Phi LLM to process the request and policy, deciding how much to pay out, and then register that decision with ACL.

The `arm-template.json` has parameters for both the 

TODO:
 - Remove ssh access and start server on startup
 - Add support for processing using Phi 3
 - Use a restrictive policy to provide security guarantees
import * as ccfapp from "@microsoft/ccf-app";
import {
  equal_uint8array,
  MAP_PREFIX,
  SINGLETON_KEY,
} from "./common";
import { Base64 } from "js-base64";
import {
  ccf,
  snp_attestation,
  SnpAttestationResult,
} from "@microsoft/ccf-app/global";

interface UvmEndorsements {
  did: string;
  feed: string;
  svn: string;
}

interface ValidProcessorPolicy {
  uvm_endorsements: UvmEndorsements;
  measurement: string[];
  policy: string[];
}

interface ProcessorMetadata {
  uvm_endorsements: UvmEndorsements;
  measurement: string;
  policy: string;
}

const validProcessorPolicy = ccfapp.typedKv(
  MAP_PREFIX + "validProcessorProperties",
  ccfapp.arrayBuffer,
  ccfapp.json<ValidProcessorPolicy>()
);
const processors = ccfapp.typedKv(
  MAP_PREFIX + "validProcessors",
  ccfapp.string,
  ccfapp.json<ProcessorMetadata>()
);

export function isValidProcessor(processor_cert_fingerprint: string): boolean {
  let metadata = processors.get(processor_cert_fingerprint);
  try {
    validateProcessorMetadata(metadata);
  } catch (error) {
    return false;
  }
  return true;
}

function validateProcessorMetadata(properties: ProcessorMetadata) {
  let valid_properties = validProcessorPolicy.get(SINGLETON_KEY);
  if (
    properties.uvm_endorsements.did !== valid_properties.uvm_endorsements.did
  ) {
    throw new Error("DID did not match");
  }
  if (
    properties.uvm_endorsements.feed !== valid_properties.uvm_endorsements.feed
  ) {
    throw new Error("FEED did not match");
  }
  if (
    properties.uvm_endorsements.svn < valid_properties.uvm_endorsements.svn
  ) {
    throw new Error("SVN is too old");
  }

  if (!valid_properties.measurement.includes(properties.measurement)) {
    throw new Error("Mesaurement is invalid");
  }
  if (!valid_properties.policy.includes(properties.policy)) {
    throw new Error("Policy is invalid");
  }
}

export function setValidProcessorPolicy(
  request: ccfapp.Request<ValidProcessorPolicy>
): ccfapp.Response<any | string> {
  const callerId = acl.certUtils.convertToAclFingerprintFormat();
  const actionPermitted = acl.authz.actionAllowed(callerId, "/processor/write");
  if (!actionPermitted) {
    return {
      statusCode: 403,
      body: `${callerId} is not authorized to set uvm endorsements.`
    };
  }

  let { uvm_endorsements, measurement, policy } = request.body.json();
  let processor_policy: ValidProcessorPolicy;
  try {
    if (
      !uvm_endorsements ||
      !uvm_endorsements.did ||
      !uvm_endorsements.feed ||
      !uvm_endorsements.svn
    ) {
      return { statusCode: 400, body:  "Missing or invalid uvm endorsements."};
    }

    if (
      !measurement ||
      !Array.isArray(measurement) ||
      !measurement.every((item) => typeof item === "string")
    ) {
      return { statusCode: 400, body:  "Missing or invalid measurements"};
    }

    if (
      !policy ||
      !Array.isArray(policy) ||
      !policy.every((item) => typeof item === "string")
    ) {
      return { statusCode: 400, body:  "Missing or invalid policies"};
    }
    processor_policy = {
      uvm_endorsements,
      measurement,
      policy,
    };
  } catch (error) {
    return { statusCode: 400, body:  "Error while parsing policy: " + error.message};
  }

  validProcessorPolicy.set(SINGLETON_KEY, processor_policy);
  return { statusCode: 200 };
}

export function getValidProcessorPolicy(
  request: ccfapp.Request
): ccfapp.Response<ValidProcessorPolicy> {
  return {
    statusCode: 200,
    body: validProcessorPolicy.get(SINGLETON_KEY),
  };
}

interface ReqAddProcessor {
  attestation: string;
  platform_certificates: string;
  uvm_endorsements: string;
}

export function registerProcessor(
  request: ccfapp.Request<ReqAddProcessor>
): ccfapp.Response<string> {
  let bytes_attestation;
  let bytes_platform_certificates;
  let bytes_uvm_endorsements;
  try {
    let { attestation, platform_certificates, uvm_endorsements } =
      request.body.json();

    if (!attestation || typeof attestation !== "string") {
      return { statusCode: 400, body:  "Missing or invalid attestation"};
    }

    bytes_attestation = ccfapp
      .typedArray(Uint8Array)
      .encode(Base64.toUint8Array(attestation));

    if (!platform_certificates || typeof platform_certificates !== "string") {
      return { statusCode: 400, body:  "Missing or invalid platform_certificates."};
    }
    bytes_platform_certificates = ccfapp
      .typedArray(Uint8Array)
      .encode(Base64.toUint8Array(platform_certificates));

    if (!uvm_endorsements || typeof uvm_endorsements !== "string") {
      return { statusCode: 400, body:  "Missing or invalid uvm_endorsements."};
    }
    bytes_uvm_endorsements = ccfapp
      .typedArray(Uint8Array)
      .encode(Base64.toUint8Array(uvm_endorsements));
  } catch (error) {
    return {
      statusCode: 400,
      body : "Error while parsing processor metadata: " + error.message
    };
  }

  let attestation_result: SnpAttestationResult;
  try {
    attestation_result = snp_attestation.verifySnpAttestation(
      bytes_attestation,
      bytes_platform_certificates,
      bytes_uvm_endorsements
    );
  } catch (error) {
    return {
      statusCode: 400,
      body: "Error while verifying attestation: " + error.message
    };
  }

  // Check that certificate of the processor matches the attested digest
  const report_data = ccfapp
    .typedArray(Uint8Array)
    .decode(attestation_result.attestation.report_data);
  const callerId = acl.certUtils.convertToAclFingerprintFormat();
  // In theory this is utf-8 encoding
  const array_buf_callerId = ccfapp.string.encode(callerId);
  const expected_report_data = ccfapp
    .typedArray(Uint8Array)
    .decode(ccf.crypto.digest("SHA-256", array_buf_callerId));
  if (equal_uint8array(expected_report_data, report_data.slice(0, 256))) {
    return {
      statusCode: 400,
      body: "Report data " +
        JSON.stringify({
          report_data: Base64.fromUint8Array(
            ccfapp
              .typedArray(Uint8Array)
              .decode(attestation_result.attestation.report_data.slice(0, 255))
          ),
          cert: Base64.fromUint8Array(
            ccfapp.typedArray(Uint8Array).decode(expected_report_data)
          ),
        })
    };
  }

  let measurement_b64 = Base64.fromUint8Array(
    ccfapp
      .typedArray(Uint8Array)
      .decode(attestation_result.attestation.measurement)
  );
  let policy_b64 = Base64.fromUint8Array(
    ccfapp
      .typedArray(Uint8Array)
      .decode(attestation_result.attestation.host_data)
  );
  let metadata: ProcessorMetadata = {
    uvm_endorsements: attestation_result.uvm_endorsements,
    measurement: measurement_b64,
    policy: policy_b64,
  };

  try {
    validateProcessorMetadata(metadata);
  } catch (error) {
    return { statusCode: 400, body:  JSON.stringify({
      errormessage: error.message,
      attested_metadata: metadata,
    })
    };
  }

  const processorCertFingerprint =
    acl.certUtils.convertToAclFingerprintFormat();
  processors.set(processorCertFingerprint, metadata);

  return { statusCode: 200 };
}

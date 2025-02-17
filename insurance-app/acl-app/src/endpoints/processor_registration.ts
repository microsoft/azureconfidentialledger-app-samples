import * as ccfapp from "@microsoft/ccf-app";
import { equal_uint8array, MAP_PREFIX, SINGLETON_KEY } from "./common";
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

export interface ProcessorMetadata {
  uvm_endorsements: UvmEndorsements;
  measurement: string;
  policy: string;
}

const validProcessorPolicy = ccfapp.typedKv(
  MAP_PREFIX + "validProcessorProperties",
  ccfapp.arrayBuffer,
  ccfapp.json<string[]>(),
);
const processors = ccfapp.typedKv(
  MAP_PREFIX + "validProcessors",
  ccfapp.string,
  ccfapp.json<ProcessorMetadata>(),
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

export function getProcessorMetadata(
  processor_cert_fingerprint: string,
): ProcessorMetadata {
  return processors.get(processor_cert_fingerprint);
}

function validateProcessorMetadata(properties: ProcessorMetadata) {
  let valid_policies = validProcessorPolicy.get(SINGLETON_KEY);
  if (!valid_policies.includes(properties.policy)) {
    throw new Error("UVM's policy is invalid.");
  }
}

export function setValidProcessorPolicy(
  request: ccfapp.Request<{ policies: string[] }>,
): ccfapp.Response<any | string> {
  const callerId = acl.certUtils.convertToAclFingerprintFormat();
  const actionPermitted = acl.authz.actionAllowed(callerId, "/processor/write");
  if (!actionPermitted) {
    return {
      statusCode: 403,
      body: `${callerId} is not authorized to set uvm endorsements.`,
    };
  }

  try {
    var { policies } = request.body.json();
    if (
      !policies ||
      !Array.isArray(policies) ||
      !policies.every((item) => typeof item === "string")
    ) {
      return { statusCode: 400, body: "Missing or invalid policies" };
    }
  } catch (error) {
    return {
      statusCode: 400,
      body: "Error while parsing policy: " + error.message,
    };
  }

  validProcessorPolicy.set(SINGLETON_KEY, policies);
  return { statusCode: 200 };
}

export function getValidProcessorPolicy(
  request: ccfapp.Request,
): ccfapp.Response<string[]> {
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
  request: ccfapp.Request<ReqAddProcessor>,
): ccfapp.Response<string> {
  let bytes_attestation;
  let bytes_platform_certificates;
  let bytes_uvm_endorsements;
  try {
    let { attestation, platform_certificates, uvm_endorsements } =
      request.body.json();

    if (!attestation || typeof attestation !== "string") {
      return { statusCode: 400, body: "Missing or invalid attestation" };
    }

    bytes_attestation = ccfapp
      .typedArray(Uint8Array)
      .encode(Base64.toUint8Array(attestation));

    if (!platform_certificates || typeof platform_certificates !== "string") {
      return {
        statusCode: 400,
        body: "Missing or invalid platform_certificates.",
      };
    }
    bytes_platform_certificates = ccfapp
      .typedArray(Uint8Array)
      .encode(Base64.toUint8Array(platform_certificates));

    if (!uvm_endorsements || typeof uvm_endorsements !== "string") {
      return { statusCode: 400, body: "Missing or invalid uvm_endorsements." };
    }
    bytes_uvm_endorsements = ccfapp
      .typedArray(Uint8Array)
      .encode(Base64.toUint8Array(uvm_endorsements));
  } catch (error) {
    return {
      statusCode: 400,
      body: "Error while parsing processor metadata: " + error.message,
    };
  }

  let attestation_result: SnpAttestationResult;
  try {
    attestation_result = snp_attestation.verifySnpAttestation(
      bytes_attestation,
      bytes_platform_certificates,
      bytes_uvm_endorsements,
    );
  } catch (error) {
    return {
      statusCode: 400,
      body: "Error while verifying attestation: " + error.message,
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
  if (
    !equal_uint8array(
      expected_report_data.slice(0, 32),
      report_data.slice(0, 32),
    )
  ) {
    return {
      statusCode: 400,
      body:
        "Report data " +
        JSON.stringify({
          report_data: Base64.fromUint8Array(
            ccfapp
              .typedArray(Uint8Array)
              .decode(attestation_result.attestation.report_data.slice(0, 32)),
          ),
          cert: Base64.fromUint8Array(
            ccfapp.typedArray(Uint8Array).decode(expected_report_data),
          ),
        }),
    };
  }

  let measurement_b64 = Base64.fromUint8Array(
    ccfapp
      .typedArray(Uint8Array)
      .decode(attestation_result.attestation.measurement),
  );
  let policy_b64 = Base64.fromUint8Array(
    ccfapp
      .typedArray(Uint8Array)
      .decode(attestation_result.attestation.host_data),
  );
  let metadata: ProcessorMetadata = {
    uvm_endorsements: attestation_result.uvm_endorsements,
    measurement: measurement_b64,
    policy: policy_b64,
  };

  try {
    validateProcessorMetadata(metadata);
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        errormessage: error.message,
        attested_metadata: metadata,
      }),
    };
  }

  const processorCertFingerprint =
    acl.certUtils.convertToAclFingerprintFormat();
  processors.set(processorCertFingerprint, metadata);

  return { statusCode: 200 };
}

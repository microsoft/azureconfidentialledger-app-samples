import * as ccfapp from "@microsoft/ccf-app"

export interface ErrorResponse {
  error: string;
}

export function errorResponse(code: number, msg: string) {
  return {
    statusCode : code,
    body: {
      error : msg,
    }
  }
}

// Helper Function to Decode first part of the JWT which contains attributes like iss, oid, aud, nbf, exp
// Returns decoded OID 
export function decodeJWT(token) {
    // Split the JWT into its parts (header, payload, signature)
    const parts = token.split('.');

    console.info(`Part1: ${parts[1]}`)
    const tokenToDecode = parts[1]

    try
    {   
        let decodedToken = decodeBase64(tokenToDecode);
        console.info(`Decoded Token: ${decodedToken}`)
        // Convert to JSON object
        const jsonDecodedToken = JSON.parse(decodedToken);
        console.info(`OID: ${jsonDecodedToken.oid}`);
        return jsonDecodedToken.oid;
    }catch (e) {
        console.error(`Error Decoding Token ${tokenDecode}:`, e);
        return null;
    }

}

//Helper: Decode each Base64 character into its corresponding 6-bit value
//Had to write this since their was no utility that does base64 decoding
// returns decoded string
export function decodeBase64(base64) {

    // Base64 alphabet for decoding
    const b64chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    let binaryStr = '';
    for (let i = 0; i < base64.length; i++) {
        const char = base64[i];
        if (char === '=') continue;  // Ignore padding
        const index = b64chars.indexOf(char);
        if (index === -1) {
            throw new Error(`Invalid Base64 character: ${char}`);
        }
        binaryStr += index.toString(2).padStart(6, '0');
    }

    // Convert binary string to bytes (8-bit chunks)
    let decoded = '';
    for (let i = 0; i < binaryStr.length; i += 8) {
        const byte = binaryStr.substring(i, i + 8);
        if (byte.length === 8) {
            decoded += String.fromCharCode(parseInt(byte, 2));
        }
    }
    return decoded;
}

export function getJWTUser(authHeader: string) {
  // Get OID from Authorization header
  if (authHeader && authHeader.startsWith("Bearer ")) {
    let token = authHeader.slice(7);  // Remove "Bearer " prefix
    return decodeJWT(token);
  } else {
    return undefined;
  }
}

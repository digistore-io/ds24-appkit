// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// AWS Signature Version 4, with types on.
//
// The algorithm lives in `sigv4.mjs` next door — `scripts/media/check.mjs` has
// to sign real requests to prove a bucket is reachable, and the scripts in this
// repo do not import TypeScript (CLAUDE.md → "Three systems"). This file adds
// the shapes, which is what stops a caller signing a request with a header map
// where a header list belongs. The same split `lib/ai/tasks.ts` has with
// `lib/ai/task-rules.mjs`.
//
// Everything about the algorithm itself — why `uriEncode` is not
// `encodeURIComponent`, why the canonical query is sorted after encoding, why a
// presigned URL signs `UNSIGNED-PAYLOAD` — is documented in the `.mjs`. Read it
// before changing anything, and read `sigv4-vectors.json` before changing that.
import {
  ALGORITHM as ALGORITHM_RAW,
  EMPTY_PAYLOAD_SHA256 as EMPTY_PAYLOAD_SHA256_RAW,
  UNSIGNED_PAYLOAD as UNSIGNED_PAYLOAD_RAW,
  amzDates as amzDatesRaw,
  canonicalQuery as canonicalQueryRaw,
  canonicalRequest as canonicalRequestRaw,
  credentialScope as credentialScopeRaw,
  presignUrl as presignUrlRaw,
  sha256Hex as sha256HexRaw,
  signRequest as signRequestRaw,
  signingKey as signingKeyRaw,
  stringToSign as stringToSignRaw,
  uriEncode as uriEncodeRaw,
} from "./sigv4.mjs";

export interface Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
}

export interface CanonicalInput {
  method: string;
  /** Absolute path, unencoded, starting with `/`. */
  path: string;
  query: Record<string, string>;
  /** Header names in any case; they are lowercased and sorted for you. */
  headers: Record<string, string>;
  payloadHash: string;
}

export interface SignInput extends CanonicalInput {
  credentials: Credentials;
  now: Date;
}

export interface PresignInput {
  method: string;
  /** Origin only — `https://bucket.s3.eu-central-1.amazonaws.com`. */
  endpoint: string;
  path: string;
  query?: Record<string, string>;
  credentials: Credentials;
  expiresSeconds: number;
  now: Date;
}

export const ALGORITHM: string = ALGORITHM_RAW;
export const UNSIGNED_PAYLOAD: string = UNSIGNED_PAYLOAD_RAW;
export const EMPTY_PAYLOAD_SHA256: string = EMPTY_PAYLOAD_SHA256_RAW;

export const sha256Hex: (data: Uint8Array | string) => string = sha256HexRaw;

export const uriEncode: (value: string, encodeSlash?: boolean) => string = uriEncodeRaw;

export const amzDates: (now: Date) => { amzDate: string; dateStamp: string } =
  amzDatesRaw;

export const credentialScope: (
  dateStamp: string,
  region: string,
  service: string,
) => string = credentialScopeRaw;

export const signingKey: (
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
) => Uint8Array = signingKeyRaw;

export const canonicalQuery: (params: Record<string, string>) => string =
  canonicalQueryRaw;

export const canonicalRequest: (input: CanonicalInput) => {
  text: string;
  signedHeaders: string;
} = canonicalRequestRaw;

export const stringToSign: (
  amzDate: string,
  scope: string,
  canonical: string,
) => string = stringToSignRaw;

export const signRequest: (input: SignInput) => {
  headers: Record<string, string>;
  signature: string;
} = signRequestRaw;

export const presignUrl: (input: PresignInput) => string = presignUrlRaw;

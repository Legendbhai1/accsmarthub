/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as credentialStore from "../credentialStore.js";
import type * as credentials from "../credentials.js";
import type * as http from "../http.js";
import type * as lib from "../lib.js";
import type * as marketplace from "../marketplace.js";
import type * as payments from "../payments.js";
import type * as reports from "../reports.js";
import type * as stats from "../stats.js";
import type * as stores from "../stores.js";
import type * as users from "../users.js";
import type * as wallet from "../wallet.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  credentialStore: typeof credentialStore;
  credentials: typeof credentials;
  http: typeof http;
  lib: typeof lib;
  marketplace: typeof marketplace;
  payments: typeof payments;
  reports: typeof reports;
  stats: typeof stats;
  stores: typeof stores;
  users: typeof users;
  wallet: typeof wallet;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

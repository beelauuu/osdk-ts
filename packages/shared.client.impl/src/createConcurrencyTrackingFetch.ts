/*
 * Copyright 2026 Palantir Technologies, Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export const OSDK_REQUEST_CONTEXT_HEADER = "X-OSDK-Request-Context";

function requestContextWithConcurrency(
  requestContextHeader: string | null,
  concurrency: number,
): string {
  let requestContext: Record<string, unknown> = {};

  if (requestContextHeader != null) {
    try {
      const parsedRequestContext: unknown = JSON.parse(requestContextHeader);
      if (
        typeof parsedRequestContext === "object" &&
        parsedRequestContext != null &&
        !Array.isArray(parsedRequestContext)
      ) {
        requestContext = parsedRequestContext as Record<string, unknown>;
      }
    } catch {
      // Ignore malformed request context headers.
    }
  }

  const existingClientMetrics = requestContext.clientMetrics;
  const clientMetrics =
    typeof existingClientMetrics === "object" &&
    existingClientMetrics != null &&
    !Array.isArray(existingClientMetrics)
      ? (existingClientMetrics as Record<string, unknown>)
      : {};

  return JSON.stringify({
    ...requestContext,
    clientMetrics: {
      ...clientMetrics,
      concurrency,
    },
  });
}

export function createConcurrencyTrackingFetch(
  fetchFn: typeof globalThis.fetch,
): typeof globalThis.fetch {
  let activeHttpAttempts = 0;

  return async function concurrencyTrackingFetch(input, init) {
    const headers = new Headers(
      input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers != null) {
      new Headers(init.headers).forEach((value, name) => {
        headers.set(name, value);
      });
    }

    activeHttpAttempts++;
    try {
      headers.set(
        OSDK_REQUEST_CONTEXT_HEADER,
        requestContextWithConcurrency(
          headers.get(OSDK_REQUEST_CONTEXT_HEADER),
          activeHttpAttempts,
        ),
      );
      return await fetchFn(input, { ...init, headers });
    } finally {
      activeHttpAttempts--;
    }
  };
}

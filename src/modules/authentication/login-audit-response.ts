export type BufferedAuthenticationResponse = Readonly<{
  status: number;
  statusText: string;
  body: ArrayBuffer;
  headers: readonly (readonly [string, string])[];
  setCookieHeaders: readonly string[];
}>;

export async function bufferAuthenticationResponse(
  response: Response,
): Promise<BufferedAuthenticationResponse> {
  return {
    status: response.status,
    statusText: response.statusText,
    body: await response.arrayBuffer(),
    headers: [...response.headers.entries()].filter(
      ([name]) => name.toLowerCase() !== "set-cookie",
    ),
    setCookieHeaders: response.headers.getSetCookie(),
  };
}

export function releaseAuthenticationResponse(
  response: BufferedAuthenticationResponse,
): Response {
  const headers = new Headers(
    response.headers.map(([name, value]): [string, string] => [name, value]),
  );
  for (const setCookieHeader of response.setCookieHeaders) {
    headers.append("set-cookie", setCookieHeader);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

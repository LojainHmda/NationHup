import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  // Don't throw for 409 Conflict - let calling code handle it for better error messages
  if (!res.ok && res.status !== 409) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

/** User-facing text from errors thrown by apiRequest (format: "status: body"). */
export function getApiErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return typeof error === "string" ? error : "Something went wrong. Please try again.";
  }
  const msg = error.message;
  const match = msg.match(/^(\d{3}):\s*(.*)$/s);
  if (!match) return msg;
  const body = match[2].trim();
  if (!body) return "Request failed. Please try again.";
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string; reason?: string };
    if (typeof parsed.reason === "string" && parsed.reason.trim()) return parsed.reason.trim();
    if (typeof parsed.message === "string" && parsed.message) return parsed.message;
    if (typeof parsed.error === "string" && parsed.error) return parsed.error;
  } catch {
    return body;
  }
  return body;
}

export async function apiRequest(
  url: string,
  method: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Handle query parameters properly
    let url: string;
    if (queryKey.length === 1) {
      url = queryKey[0] as string;
    } else {
      const baseUrl = queryKey[0] as string;
      const queryParams = queryKey[1] as string;
      url = queryParams ? `${baseUrl}?${queryParams}` : baseUrl;
    }
    
    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

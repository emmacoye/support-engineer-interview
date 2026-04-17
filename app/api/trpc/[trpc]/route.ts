import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/routers";
import { createContext } from "@/server/trpc";

/** Never statically cache tRPC — queries may use GET; stale cache would bypass session checks. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function handler(req: Request) {
  const res = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
  });
  res.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.headers.set("Vary", "Cookie");
  return res;
}

export { handler as GET, handler as POST };

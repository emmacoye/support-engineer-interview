import { initTRPC, TRPCError } from "@trpc/server";
import { CreateNextContextOptions } from "@trpc/server/adapters/next";
import { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import jwt from "jsonwebtoken";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decryptSSN } from "@/lib/crypto";
import { getSessionCookieToken, isSessionValidByExpiry } from "@/lib/session";

/** Set `SEC304_DEBUG=1` to log in production; otherwise logs only when `NODE_ENV !== "production"`. */
function sec304Log(phase: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production" && process.env.SEC304_DEBUG !== "1") return;
  console.log(`[SEC-304] ${phase}`, JSON.stringify(payload));
}

export async function createContext(opts: CreateNextContextOptions | FetchCreateContextFnOptions) {
  // Handle different adapter types
  let req: any;
  let res: any;

  if ("req" in opts && "res" in opts) {
    // Next.js adapter
    req = opts.req;
    res = opts.res;
  } else {
    // Fetch adapter
    req = opts.req;
    res = opts.resHeaders;
  }

  const token = getSessionCookieToken(req);

  let user = null;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "temporary-secret-for-interview") as {
        userId: number;
      };

      // SEC-304: JWT signature alone is not enough — a row must still exist in `sessions` (revoked / other-device login deletes rows).
      // PERF-407: session row + user row are independent reads — parallelize (both indexed: token unique, user PK).
      const [session, userRow] = await Promise.all([
        db.select().from(sessions).where(eq(sessions.token, token)).get(),
        db.select().from(users).where(eq(users.id, decoded.userId)).get(),
      ]);

      const jwtUserId = decoded.userId;
      const sessionMatchesJwt = !!(session && session.userId === jwtUserId);
      const sessionTokenMatchesCookie = session ? session.token === token : false;
      const expiryOk = session ? isSessionValidByExpiry(session.expiresAt) : false;
      const accepted =
        !!(
          session &&
          userRow &&
          session.userId === decoded.userId &&
          userRow.id === session.userId &&
          isSessionValidByExpiry(session.expiresAt)
        );

      sec304Log("createContext", {
        incomingToken: token,
        jwtUserId,
        dbLookupSessionRow: session
          ? {
              id: session.id,
              userId: session.userId,
              tokenInDb: session.token,
              expiresAt: session.expiresAt,
            }
          : null,
        sessionMatchesJwt,
        sessionTokenMatchesCookie,
        expiryOk,
        userAccepted: accepted,
      });

      if (
        session &&
        userRow &&
        session.userId === decoded.userId &&
        userRow.id === session.userId &&
        // PERF-403: require expiry at least SESSION_EXPIRY_BUFFER_MS in the future (server-side; never trust client).
        isSessionValidByExpiry(session.expiresAt)
      ) {
        user = userRow;
        // SEC-301: decrypt SSN after reading from DB so downstream code uses plaintext values.
        user = { ...user, ssn: decryptSSN(user.ssn) };
      }
    } catch (error) {
      sec304Log("createContext", {
        incomingToken: token,
        jwtVerifyFailed: true,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    user,
    req,
    res,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }

  // SEC-304: on every protected call, require a live `sessions` row for this cookie token (login elsewhere deletes old rows).
  const incomingToken = getSessionCookieToken(ctx.req);
  if (!incomingToken) {
    sec304Log("protectedProcedure", {
      decision: "REJECT",
      reason: "no_cookie_token",
      ctxUserId: ctx.user.id,
    });
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Session invalidated" });
  }
  const sessionRow = await db.select().from(sessions).where(eq(sessions.token, incomingToken)).get();
  const expiryOk = sessionRow ? isSessionValidByExpiry(sessionRow.expiresAt) : false;
  const userIdOk = sessionRow ? sessionRow.userId === ctx.user.id : false;
  const tokenMatchesDb = sessionRow ? sessionRow.token === incomingToken : false;

  if (!sessionRow || !expiryOk) {
    sec304Log("protectedProcedure", {
      decision: "REJECT",
      reason: !sessionRow ? "db_lookup_miss_or_expired" : "expired",
      incomingToken,
      ctxUserId: ctx.user.id,
      dbLookupSessionRow: sessionRow
        ? { id: sessionRow.id, userId: sessionRow.userId, tokenInDb: sessionRow.token, expiresAt: sessionRow.expiresAt }
        : null,
      expiryOk,
      tokenMatchesDb,
    });
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Session invalidated" });
  }
  if (!userIdOk) {
    sec304Log("protectedProcedure", {
      decision: "REJECT",
      reason: "session_user_mismatch",
      incomingToken,
      ctxUserId: ctx.user.id,
      dbLookupSessionRow: {
        id: sessionRow.id,
        userId: sessionRow.userId,
        tokenInDb: sessionRow.token,
      },
      tokenMatchesDb,
    });
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Session invalidated" });
  }

  sec304Log("protectedProcedure", {
    decision: "ACCEPT",
    incomingToken,
    ctxUserId: ctx.user.id,
    dbLookupSessionRow: {
      id: sessionRow.id,
      userId: sessionRow.userId,
      tokenInDb: sessionRow.token,
    },
    tokenMatchesDb,
    expiryOk,
  });

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

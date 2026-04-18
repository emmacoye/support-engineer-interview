import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../trpc";
import { db } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decryptSSN, encryptSSN } from "@/lib/crypto";
import { dobErrorMessage, validateDob } from "@/lib/validation/dob";
import { validatePassword } from "@/lib/validation/password";
import { zodEmail } from "@/lib/validation/email";
import { INVALID_PHONE_MESSAGE, normalizePhoneNumber, validatePhoneNumber } from "@/lib/validation/phone";
import { INVALID_US_STATE_MESSAGE, normalizeStateCode, validateStateCode } from "@/lib/validation/state";
import { getSessionCookieToken } from "@/lib/session";

export const authRouter = router({
  signup: publicProcedure
    .input(
      z
        .object({
          // VAL-201: strict format + always lowercase before persistence (same rules as client).
          email: zodEmail(),
          password: z.string(),
          firstName: z.string().min(1),
          lastName: z.string().min(1),
          // VAL-204: normalize to digits only; US or E.164 length rules (same as client).
          phoneNumber: z
            .string()
            .trim()
            .transform((s) => normalizePhoneNumber(s))
            .pipe(
              z
                .string()
                .min(1, { message: "Phone number is required" })
                .refine(validatePhoneNumber, { message: INVALID_PHONE_MESSAGE })
            ),
          dateOfBirth: z.string(),
          ssn: z.string().regex(/^\d{9}$/),
          address: z.string().min(1),
          city: z.string().min(1),
          // VAL-203: must be a real US state/territory code; normalize to uppercase before persistence.
          state: z
            .string()
            .trim()
            .transform((s) => normalizeStateCode(s))
            .pipe(
              z
                .string()
                .length(2, { message: "State must be exactly 2 letters" })
                .regex(/^[A-Z]{2}$/, { message: "State must be exactly 2 letters" })
                .refine(validateStateCode, { message: INVALID_US_STATE_MESSAGE })
            ),
          zipCode: z.string().regex(/^\d{5}$/),
        })
        // VAL-202: enforce DOB boundaries server-side (never trust client).
        .superRefine((data, ctx) => {
          // VAL-208: enforce password complexity server-side and cap length (<=128) to prevent bcrypt DoS.
          for (const message of validatePassword(data.password)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["password"],
              message,
            });
          }

          const result = validateDob(data.dateOfBirth);
          if (!result.ok) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["dateOfBirth"],
              message: dobErrorMessage(result.code),
            });
          }
        })
    )
    .mutation(async ({ input, ctx }) => {
      const existingUser = await db.select().from(users).where(eq(users.email, input.email)).get();

      if (existingUser) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "User already exists",
        });
      }

      const hashedPassword = await bcrypt.hash(input.password, 10);

      await db.insert(users).values({
        ...input,
        // SEC-301: encrypt SSN before writing to DB (PII at rest).
        ssn: encryptSSN(input.ssn),
        password: hashedPassword,
      });

      // Fetch the created user
      const user = await db.select().from(users).where(eq(users.email, input.email)).get();

      if (!user) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create user",
        });
      }

      // Create session
      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || "temporary-secret-for-interview", {
        expiresIn: "7d",
      });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // SEC-304: invalidate then create session (sequential sync Drizzle calls — better-sqlite3 rejects async transaction callbacks).
      await db.delete(sessions).where(eq(sessions.userId, user.id));
      await db.insert(sessions).values({
        userId: user.id,
        token,
        expiresAt: expiresAt.toISOString(),
      });

      // Set cookie
      if ("setHeader" in ctx.res) {
        ctx.res.setHeader("Set-Cookie", `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
      } else {
        (ctx.res as Headers).set("Set-Cookie", `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
      }

      // SEC-301: decrypt SSN after reading from DB so API behavior remains consistent.
      return { user: { ...user, ssn: decryptSSN(user.ssn), password: undefined }, token };
    }),

  login: publicProcedure
    .input(
      z.object({
        // VAL-201: same validation as signup; normalize so uppercase login matches lowercase rows.
        email: zodEmail(),
        password: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await db.select().from(users).where(eq(users.email, input.email)).get();

      if (!user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      }

      const validPassword = await bcrypt.compare(input.password, user.password);

      if (!validPassword) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      }

      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || "temporary-secret-for-interview", {
        expiresIn: "7d",
      });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // SEC-304: delete all sessions for this user_id first, then insert the new row (sync driver; UNIQUE(user_id) still caps duplicates in DB).
      await db.delete(sessions).where(eq(sessions.userId, user.id));
      await db.insert(sessions).values({
        userId: user.id,
        token,
        expiresAt: expiresAt.toISOString(),
      });

      if ("setHeader" in ctx.res) {
        ctx.res.setHeader("Set-Cookie", `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
      } else {
        (ctx.res as Headers).set("Set-Cookie", `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
      }

      // SEC-301: decrypt SSN after reading from DB so callers don't receive ciphertext.
      return { user: { ...user, ssn: decryptSSN(user.ssn), password: undefined }, token };
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    // SEC-304: revoke the cookie's session row when present (do not require ctx.user).
    const token = getSessionCookieToken(ctx.req);

    const clearSessionCookie = () => {
      if ("setHeader" in ctx.res) {
        ctx.res.setHeader("Set-Cookie", `session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
      } else {
        (ctx.res as Headers).set("Set-Cookie", `session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
      }
    };

    // PERF-402: With a token we must complete DB delete before clearing the cookie; never report success if delete throws.
    // No token → nothing to delete in DB; still clear client cookie and succeed (already logged out).
    if (!token) {
      clearSessionCookie();
      return { success: true as const, message: "No active session" };
    }

    try {
      // better-sqlite3 is synchronous — use `.run()` so we never depend on QueryPromise/async
      // microtasks (avoids rare "await delete" failures in the Next/tRPC server bundle).
      db.delete(sessions).where(eq(sessions.token, token)).run();
    } catch (e) {
      console.error("Logout DB deletion error:", e);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Logout failed. Please try again.",
      });
    }

    clearSessionCookie();
    return { success: true as const, message: "Logged out successfully" };
  }),

  logoutAllDevices: protectedProcedure.mutation(async ({ ctx }) => {
    // SEC-304: server-side revoke every session for this user (JWT alone is never enough — rows must disappear).
    await db.delete(sessions).where(eq(sessions.userId, ctx.user.id));

    if ("setHeader" in ctx.res) {
      ctx.res.setHeader("Set-Cookie", `session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    } else {
      (ctx.res as Headers).set("Set-Cookie", `session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    }

    return { success: true as const, message: "Signed out of all devices" };
  }),
});

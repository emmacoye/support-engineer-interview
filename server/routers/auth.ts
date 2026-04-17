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
import { getSessionCookieToken } from "@/lib/session";

export const authRouter = router({
  signup: publicProcedure
    .input(
      z
        .object({
          email: z.string().email().toLowerCase(),
          password: z.string(),
          firstName: z.string().min(1),
          lastName: z.string().min(1),
          phoneNumber: z.string().regex(/^\+?\d{10,15}$/),
          dateOfBirth: z.string(),
          ssn: z.string().regex(/^\d{9}$/),
          address: z.string().min(1),
          city: z.string().min(1),
          state: z.string().length(2).toUpperCase(),
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
        email: z.string().email().transform((e) => e.trim().toLowerCase()),
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
    // SEC-304: always revoke the cookie's session row in DB when present (do not require ctx.user — JWT may still verify after row was deleted elsewhere).
    const token = getSessionCookieToken(ctx.req);
    if (token) {
      await db.delete(sessions).where(eq(sessions.token, token));
    }

    if ("setHeader" in ctx.res) {
      ctx.res.setHeader("Set-Cookie", `session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    } else {
      (ctx.res as Headers).set("Set-Cookie", `session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    }

    return { success: true, message: token ? "Logged out successfully" : "No active session" };
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

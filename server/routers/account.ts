import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../trpc";
import { db } from "@/lib/db";
import { accounts, transactions } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { validateCard } from "@/lib/validation/card";
import { centsFromDb, OPENING_BALANCE_DOLLARS, toCents } from "@/lib/currency";

function generateAccountNumber(): string {
  return Math.floor(Math.random() * 1000000000)
    .toString()
    .padStart(10, "0");
}

export const accountRouter = router({
  createAccount: protectedProcedure
    .input(
      z.object({
        accountType: z.enum(["checking", "savings"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check if user already has an account of this type
      const existingAccount = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.userId, ctx.user.id), eq(accounts.accountType, input.accountType)))
        .get();

      if (existingAccount) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `You already have a ${input.accountType} account`,
        });
      }

      let accountNumber;
      let isUnique = false;

      // Generate unique account number
      while (!isUnique) {
        accountNumber = generateAccountNumber();
        const existing = await db.select().from(accounts).where(eq(accounts.accountNumber, accountNumber)).get();
        isUnique = !existing;
      }

      try {
        // PERF-406: opening credit is defined in dollars; convert to cents only at write (never toCents on DB reads).
        await db.insert(accounts).values({
          userId: ctx.user.id,
          accountNumber: accountNumber!,
          accountType: input.accountType,
          balance: toCents(OPENING_BALANCE_DOLLARS),
          status: "active",
        });

        // PERF-401: never return a "default" $100 account unless the DB write is confirmed.
        const account = await db.select().from(accounts).where(eq(accounts.accountNumber, accountNumber!)).get();
        if (!account) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Account creation failed. Please try again." });
        }

        return account;
      } catch (err) {
        // PERF-401: propagate DB errors to the client; do not swallow and return a fake balance.
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Account creation failed. Please try again." });
      }
    }),

  getAccounts: protectedProcedure.query(async ({ ctx }) => {
    const userAccounts = await db.select().from(accounts).where(eq(accounts.userId, ctx.user.id));

    return userAccounts;
  }),

  fundAccount: protectedProcedure
    .input(
      z.object({
        accountId: z.number(),
        amount: z.number().positive(),
        fundingSource: z
          .object({
            type: z.enum(["card", "bank"]),
            accountNumber: z.string(),
            routingNumber: z.string().optional(),
          })
          .superRefine((value, ctx) => {
            if (value.type !== "card") return;

            // VAL-206: server-side enforcement (same shared logic as client) so invalid cards can't bypass UI validation.
            if (!validateCard(value.accountNumber).ok) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["accountNumber"],
                message: "Please enter a valid card number",
              });
            }
          }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const amountDollars = parseFloat(input.amount.toString());
      const amountCents = toCents(amountDollars);

      // Verify account belongs to user
      const account = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, ctx.user.id)))
        .get();

      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found",
        });
      }

      if (account.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Account is not active",
        });
      }

      // PERF-406: store transaction amount as cents; update balance with integer cent math only.
      await db.insert(transactions).values({
        accountId: input.accountId,
        type: "deposit",
        amount: amountCents,
        description: `Funding from ${input.fundingSource.type}`,
        status: "completed",
        processedAt: new Date().toISOString(),
      });

      // PERF-406: `account.balance` is already integer cents from DB (after migration); never wrap with toCents().
      const balanceCents = centsFromDb(account.balance);
      const newBalanceCents = balanceCents + amountCents;

      // PERF-407: newest-tx read and balance update are independent after insert — run together; skip redundant re-read of balance.
      const [transaction] = await Promise.all([
        db
          .select()
          .from(transactions)
          .where(eq(transactions.accountId, input.accountId))
          .orderBy(desc(transactions.createdAt))
          .limit(1)
          .get(),
        db
          .update(accounts)
          .set({
            balance: newBalanceCents,
          })
          .where(eq(accounts.id, input.accountId)),
      ]);

      return {
        transaction,
        newBalance: newBalanceCents,
      };
    }),

  getTransactions: protectedProcedure
    .input(
      z.object({
        accountId: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      // PERF-407: one joined query when history exists; empty history still needs ownership probe below.
      const rows = await db
        .select({
          id: transactions.id,
          accountId: transactions.accountId,
          type: transactions.type,
          amount: transactions.amount,
          description: transactions.description,
          status: transactions.status,
          createdAt: transactions.createdAt,
          processedAt: transactions.processedAt,
          accountType: accounts.accountType,
        })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, ctx.user.id)))
        .orderBy(desc(transactions.createdAt));

      if (rows.length === 0) {
        const owned = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, ctx.user.id)))
          .get();
        if (!owned) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Account not found",
          });
        }
        return [];
      }

      return rows.map((r) => ({
        id: r.id,
        accountId: r.accountId,
        type: r.type,
        amount: r.amount,
        description: r.description,
        status: r.status,
        createdAt: r.createdAt,
        processedAt: r.processedAt,
        accountType: r.accountType,
      }));
    }),
});

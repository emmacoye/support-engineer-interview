"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { trpc } from "@/lib/trpc/client";
import { validateCard } from "@/lib/validation/card";
import { validateRoutingNumber } from "@/lib/validation/routing";
import { INVALID_AMOUNT_MESSAGE, validateAmount } from "@/lib/validation/amount";
import { Input } from "@/components/ui/input";

interface FundingModalProps {
  accountId: number;
  onClose: () => void;
  onSuccess: () => void;
}

type FundingFormData = {
  amount: string;
  fundingType: "card" | "bank";
  accountNumber: string;
  routingNumber?: string;
};

export function FundingModal({ accountId, onClose, onSuccess }: FundingModalProps) {
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FundingFormData>({
    defaultValues: {
      fundingType: "card",
    },
  });

  const fundingType = watch("fundingType");
  const utils = trpc.useUtils();
  const fundAccountMutation = trpc.account.fundAccount.useMutation();

  const onSubmit = async (data: FundingFormData) => {
    setError("");

    try {
      // PERF-406: amount is dollars as a validated string; server parses and converts to integer cents for DB math.
      await fundAccountMutation.mutateAsync({
        accountId,
        amount: data.amount.trim(),
        fundingSource: {
          type: data.fundingType,
          accountNumber: data.accountNumber,
          // VAL-207: only bank sends routing; trim so server Zod sees a clean 9-digit string.
          routingNumber: data.fundingType === "bank" ? data.routingNumber?.trim() : undefined,
        },
      });

      // PERF-405: funding inserts a row; invalidate cached queries so history and balances refetch (default staleTime is 60s).
      await utils.account.getTransactions.invalidate({ accountId });
      await utils.account.getAccounts.invalidate();

      onSuccess();
    } catch (err: unknown) {
      const message =
        typeof err === "object" && err !== null && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Failed to fund account";
      setError(message);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-500/75 dark:bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg max-w-md w-full p-6 border border-transparent dark:border-gray-800 shadow-xl">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Fund Your Account</h3>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-400">Amount</label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500 dark:text-gray-500 sm:text-sm">$</span>
              </div>
              <Input
                {...register("amount", {
                  required: "Amount is required",
                  // VAL-209: same string rules as server; VAL-205: minimum $0.01 via numeric check after format passes.
                  validate: (value) => {
                    const v = (value ?? "").trim();
                    if (!v) return "Amount is required";
                    if (!validateAmount(v)) return INVALID_AMOUNT_MESSAGE;
                    const n = parseFloat(v);
                    if (Number.isNaN(n)) return INVALID_AMOUNT_MESSAGE;
                    if (n <= 0) return "Amount must be at least $0.01";
                    if (n > 10000) return "Amount cannot exceed $10,000";
                    return true;
                  },
                })}
                type="text"
                className="pl-7 block w-full rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm p-2 border"
                placeholder="0.00"
              />
            </div>
            {errors.amount && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.amount.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-400 mb-2">Funding Source</label>
            <div className="space-y-2">
              <label className="flex items-center text-gray-900 dark:text-gray-300">
                <input {...register("fundingType")} type="radio" value="card" className="mr-2" />
                <span>Credit/Debit Card</span>
              </label>
              <label className="flex items-center text-gray-900 dark:text-gray-300">
                <input {...register("fundingType")} type="radio" value="bank" className="mr-2" />
                <span>Bank Account</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-400">
              {fundingType === "card" ? "Card Number" : "Account Number"}
            </label>
            <Input
              {...register("accountNumber", {
                required: `${fundingType === "card" ? "Card" : "Account"} number is required`,
                pattern:
                  // Keep the existing bank account digits-only constraint unchanged to avoid impacting funding flows.
                  fundingType === "bank"
                    ? {
                        value: /^\d+$/,
                        message: "Invalid account number",
                      }
                    : undefined,
                validate: {
                  validCard: (value) => {
                    if (fundingType !== "card") return true;
                    // VAL-206 / VAL-210: Luhn + full BIN-range card type; unsupported brands get a specific message.
                    const result = validateCard(value);
                    return result.ok || result.message;
                  },
                },
              })}
              type="text"
              className="mt-1 block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
              placeholder={fundingType === "card" ? "1234567812345678" : "123456789"}
            />
            {errors.accountNumber && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.accountNumber.message}</p>
            )}
          </div>

          {fundingType === "bank" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-400">Routing Number</label>
              <Input
                {...register("routingNumber", {
                  // VAL-207: ACH cannot run without a valid ABA routing number — require, length-check, then checksum (same as server).
                  validate: (value) => {
                    if (fundingType !== "bank") return true;
                    const v = (value ?? "").trim();
                    if (!v) return "Routing number is required";
                    if (!/^\d{9}$/.test(v)) return "Routing number must be 9 digits";
                    if (!validateRoutingNumber(v)) return "Invalid routing number";
                    return true;
                  },
                })}
                type="text"
                className="mt-1 block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                placeholder="123456789"
              />
              {errors.routingNumber && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.routingNumber.message}</p>
              )}
            </div>
          )}

          {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-white bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={fundAccountMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-50"
            >
              {fundAccountMutation.isPending ? "Processing..." : "Fund Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

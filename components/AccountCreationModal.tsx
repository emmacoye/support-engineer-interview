"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

interface AccountCreationModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function AccountCreationModal({ onClose, onSuccess }: AccountCreationModalProps) {
  const [accountType, setAccountType] = useState<"checking" | "savings">("checking");
  const [error, setError] = useState("");

  const createAccountMutation = trpc.account.createAccount.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      await createAccountMutation.mutateAsync({ accountType });
      onSuccess();
    } catch {
      // PERF-401: show a user-friendly error and never imply a successful $100 opening balance on failure.
      setError("Account creation failed. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-500/75 dark:bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg max-w-md w-full p-6 border border-transparent dark:border-gray-800 shadow-xl">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Open New Account</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-400 mb-2">Account Type</label>
            <div className="space-y-2">
              <label className="flex items-center text-gray-900 dark:text-gray-300">
                <input
                  type="radio"
                  value="checking"
                  checked={accountType === "checking"}
                  onChange={(e) => setAccountType(e.target.value as "checking")}
                  className="mr-2"
                />
                <span>Checking Account</span>
              </label>
              <label className="flex items-center text-gray-900 dark:text-gray-300">
                <input
                  type="radio"
                  value="savings"
                  checked={accountType === "savings"}
                  onChange={(e) => setAccountType(e.target.value as "savings")}
                  className="mr-2"
                />
                <span>Savings Account</span>
              </label>
            </div>
          </div>

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
              disabled={createAccountMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-50"
            >
              {createAccountMutation.isPending ? "Creating..." : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

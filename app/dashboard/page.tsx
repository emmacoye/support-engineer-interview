"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/currency";
import { AccountCreationModal } from "@/components/AccountCreationModal";
import { FundingModal } from "@/components/FundingModal";
import { TransactionList } from "@/components/TransactionList";

export default function DashboardPage() {
  const router = useRouter();
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [fundingAccountId, setFundingAccountId] = useState<number | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [logoutError, setLogoutError] = useState("");

  const { data: accounts, refetch: refetchAccounts } = trpc.account.getAccounts.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation();
  const logoutAllDevicesMutation = trpc.auth.logoutAllDevices.useMutation();

  const handleLogout = async () => {
    setLogoutError("");
    try {
      await logoutMutation.mutateAsync();
      router.push("/");
    } catch {
      // PERF-402: server did not confirm DB revocation — do not redirect; cookie was not cleared server-side.
      setLogoutError("Logout failed. Please try again.");
    }
  };

  const handleLogoutAllDevices = async () => {
    await logoutAllDevicesMutation.mutateAsync();
    router.push("/");
  };

  // PERF-406: account.balance from API is integer cents; format for display only.
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <nav className="bg-white dark:bg-gray-900 shadow border-b border-transparent dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">SecureBank Dashboard</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLogoutAllDevices}
                disabled={logoutAllDevicesMutation.isPending}
                className="px-3 py-2 text-sm font-medium text-amber-800 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100 border border-amber-300 dark:border-amber-700 rounded-md disabled:opacity-50"
              >
                {logoutAllDevicesMutation.isPending ? "…" : "Sign out all devices"}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                disabled={logoutMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white disabled:opacity-50"
              >
                Sign Out
              </button>
            </div>
          </div>
          {logoutError ? (
            <p className="pb-3 text-sm text-red-600 dark:text-red-400" role="alert">
              {logoutError}
            </p>
          ) : null}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Your Accounts</h2>

            {accounts && accounts.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {accounts.map((account) => (
                  <div
                    key={account.id}
                    className="bg-white dark:bg-gray-900 overflow-hidden shadow rounded-lg cursor-pointer hover:shadow-lg transition border border-transparent dark:border-gray-800"
                    onClick={() => setSelectedAccountId(account.id)}
                  >
                    <div className="px-4 py-5 sm:p-6">
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                        {account.accountType.charAt(0).toUpperCase() + account.accountType.slice(1)} Account
                      </dt>
                      <dd className="mt-1 text-3xl font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(account.balance)}
                      </dd>
                      <dd className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Account: ****{account.accountNumber.slice(-4)}
                      </dd>
                      <dd className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Status:{" "}
                        <span
                          className={`font-medium ${
                            account.status === "active"
                              ? "text-green-600 dark:text-green-400"
                              : "text-yellow-600 dark:text-yellow-400"
                          }`}
                        >
                          {account.status}
                        </span>
                      </dd>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFundingAccountId(account.id);
                        }}
                        className="mt-4 w-full bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                      >
                        Fund Account
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-lg shadow border border-transparent dark:border-gray-800">
                <p className="text-gray-500 dark:text-gray-400 mb-4">You don&apos;t have any accounts yet.</p>
              </div>
            )}

            <button
              onClick={() => setIsCreatingAccount(true)}
              className="mt-4 bg-green-600 text-white px-6 py-2 rounded-md font-medium hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-500"
            >
              Open New Account
            </button>
          </div>

          {selectedAccountId && (
            <div className="mt-8">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Transaction History</h3>
              <TransactionList accountId={selectedAccountId} />
            </div>
          )}
        </div>
      </main>

      {isCreatingAccount && (
        <AccountCreationModal
          onClose={() => setIsCreatingAccount(false)}
          onSuccess={() => {
            setIsCreatingAccount(false);
            refetchAccounts();
          }}
        />
      )}

      {fundingAccountId && (
        <FundingModal
          accountId={fundingAccountId}
          onClose={() => setFundingAccountId(null)}
          onSuccess={() => {
            setFundingAccountId(null);
            refetchAccounts();
          }}
        />
      )}
    </div>
  );
}

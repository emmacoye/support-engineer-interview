export const PASSWORD_RULES = [
  { regex: /.{8,}/, message: "Password must be at least 8 characters" },
  // Max length is a security requirement: long inputs can be abused for DoS against bcrypt hashing.
  { regex: /^.{1,128}$/, message: "Password must be 128 characters or less" },
  { regex: /[A-Z]/, message: "Password must contain at least one uppercase letter" },
  { regex: /[a-z]/, message: "Password must contain at least one lowercase letter" },
  { regex: /[0-9]/, message: "Password must contain at least one number" },
  { regex: /[!@#$%^&*()_+\-=\[\]{}|;':",.<>?\/`~]/, message: "Password must contain at least one special character" },
] as const;

export function validatePassword(password: string): string[] {
  return PASSWORD_RULES.filter((rule) => !rule.regex.test(password)).map((rule) => rule.message);
}


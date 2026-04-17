"use client";

import { forwardRef, type InputHTMLAttributes } from "react";

/**
 * UI-101 / theme: Inputs use explicit light + dark colors (deeper dark panel + white text).
 */
export const formTextInputClassName =
  "text-gray-900 dark:text-white bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 placeholder-gray-400 dark:placeholder-gray-500";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={[formTextInputClassName, className].filter(Boolean).join(" ")}
      {...props}
    />
  );
});

Input.displayName = "Input";

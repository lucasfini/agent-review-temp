"use client";

import { useState } from "react";
import { Mail, CheckCircle } from "lucide-react";

interface WaitlistFormProps {
  variant?: "light" | "dark";
}

export default function WaitlistForm({ variant = "light" }: WaitlistFormProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, name }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to join waitlist");
      }

      setIsSuccess(true);
      setEmail("");
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className={`inline-flex items-center rounded-lg px-6 py-3 ${
        variant === "dark" 
          ? "bg-green-900/20 text-green-300 border border-green-800" 
          : "bg-green-900/20 text-green-300 border border-green-800/30"
      }`}>
        <CheckCircle className="mr-2 h-5 w-5" />
        <span className="font-medium">Welcome to the waitlist! Check your email.</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Your name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`w-full rounded-lg px-4 py-3 text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              variant === "dark"
                ? "bg-slate-900/10 border-white/20 text-white placeholder-white/60"
                : "bg-slate-900 border-slate-600 text-slate-50 placeholder-gray-500"
            }`}
          />
        </div>
        <div className="flex-1">
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={`w-full rounded-lg px-4 py-3 text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              variant === "dark"
                ? "bg-slate-900/10 border-white/20 text-white placeholder-white/60"
                : "bg-slate-900 border-slate-600 text-slate-50 placeholder-gray-500"
            }`}
          />
        </div>
        <button
          type="submit"
          disabled={isLoading || !email}
          className={`inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            variant === "dark"
              ? "bg-slate-900 text-slate-50 hover:bg-slate-800"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {isLoading ? (
            <div className="flex items-center">
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Joining...
            </div>
          ) : (
            <div className="flex items-center">
              <Mail className="mr-2 h-4 w-4" />
              Join Waitlist
            </div>
          )}
        </button>
      </div>
      {error && (
        <p className={`mt-2 text-sm ${
          variant === "dark" ? "text-red-300" : "text-red-600"
        }`}>
          {error}
        </p>
      )}
    </form>
  );
}
import { z } from "zod";

const name = z
  .string()
  .trim()
  .min(2, "Use a name between 2 and 40 characters.")
  .max(40, "Use a name between 2 and 40 characters.");

const passcode = z
  .string()
  .min(8, "Passcode must be at least 8 characters.")
  .max(128, "Passcode must be 128 characters or fewer.");

export const setupSchema = z.object({
  name,
  passcode,
  confirm: z.string().max(128),
  setupCode: z.string().max(200).optional().default(""),
});

export const loginSchema = z.object({
  name: z.string().trim().min(1).max(40),
  passcode: z.string().min(1).max(128),
});

export const joinSchema = z.object({
  code: z.string().trim().min(8).max(32),
  name,
  passcode,
  confirm: z.string().max(128),
});

export const policySchema = z.object({
  allowedResources: z
    .array(z.string().trim().min(1).max(60))
    .max(12)
    .default([]),
  maxDurationHours: z.number().finite().min(0.25).max(720),
  maxSpendUsd: z.number().finite().min(0).max(1_000_000),
  allowExecute: z.boolean(),
  allowAdmin: z.boolean(),
  minPurposeChars: z.number().int().min(0).max(500),
  blockedTerms: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  guidance: z.string().trim().max(2_000).default(""),
  autoDecision: z.boolean(),
  passcode: z.string().max(128).optional(),
  confirm: z.string().max(32).optional(),
});

const startsAt = z
  .union([z.string().max(60), z.null()])
  .optional()
  .transform((value) => value || null)
  .refine(
    (value) => value === null || !Number.isNaN(Date.parse(value)),
    "The requested start time is not valid."
  );

export const requestSchema = z.object({
  approverId: z.string().min(1).max(100),
  resource: z.string().trim().min(1).max(80),
  accessLevel: z.enum(["read", "execute", "admin"]),
  durationHours: z.number().finite().min(0.25).max(720),
  spendUsd: z.number().finite().min(0).max(1_000_000),
  startsAt,
  purpose: z.string().trim().min(1).max(2_000),
  details: z.string().trim().max(1_500).default(""),
});

export const decisionSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
  note: z.string().trim().max(1_000).optional().default(""),
});

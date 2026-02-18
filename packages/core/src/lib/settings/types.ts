import { z } from "zod";
import { ERC7730DescriptorSchema } from "../erc7730/parser";

export const chainConfigSchema = z.object({
  name: z.string().min(1),
});

export const addressRegistryEntrySchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  name: z.string().min(1),
  kind: z.enum(["eoa", "contract"]).default("contract"),
  chainIds: z.array(z.number()).optional(),
  abi: z.any().optional(),
  note: z.string().optional(),
  sourceUrl: z.string().url().optional(),
});

export const settingsConfigSchema = z.object({
  version: z.literal("1.0"),
  chains: z.record(z.string(), chainConfigSchema),
  addressRegistry: z.array(addressRegistryEntrySchema),
  erc7730Descriptors: z.array(ERC7730DescriptorSchema).optional().default([]),
  disabledInterpreters: z.array(z.string()).optional().default([]),
});

export type ChainConfig = z.infer<typeof chainConfigSchema>;
export type AddressRegistryEntry = z.infer<typeof addressRegistryEntrySchema>;
export type SettingsConfig = z.infer<typeof settingsConfigSchema>;

import { z } from "zod";

export const chainConfigSchema = z.object({
  name: z.string().min(1),
  rpcUrl: z.string().url().optional(),
  safeApiUrl: z.string().url().optional(),
});

export const addressBookEntrySchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  name: z.string().min(1),
  chainId: z.number().optional(),
});

export const contractRegistryEntrySchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  name: z.string().min(1),
  abi: z.any().optional(),
  chainId: z.number().optional(),
});

export const settingsConfigSchema = z.object({
  version: z.literal("1.0"),
  chains: z.record(z.string(), chainConfigSchema),
  addressBook: z.array(addressBookEntrySchema),
  contractRegistry: z.array(contractRegistryEntrySchema),
});

export type ChainConfig = z.infer<typeof chainConfigSchema>;
export type AddressBookEntry = z.infer<typeof addressBookEntrySchema>;
export type ContractRegistryEntry = z.infer<typeof contractRegistryEntrySchema>;
export type SettingsConfig = z.infer<typeof settingsConfigSchema>;

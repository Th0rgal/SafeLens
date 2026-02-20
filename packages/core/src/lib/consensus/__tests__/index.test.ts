import { describe, expect, it } from "vitest";

import {
  fetchConsensusProof,
  UnsupportedConsensusModeError,
} from "../index";

describe("consensus mode routing", () => {
  it("returns an explicit unsupported mode error for opstack chains", async () => {
    await expect(fetchConsensusProof(10)).rejects.toMatchObject({
      code: "unsupported-consensus-mode",
      chainId: 10,
      consensusMode: "opstack",
    } satisfies Partial<UnsupportedConsensusModeError>);
  });

  it("returns an explicit unsupported mode error for linea chains", async () => {
    await expect(fetchConsensusProof(59144)).rejects.toMatchObject({
      code: "unsupported-consensus-mode",
      chainId: 59144,
      consensusMode: "linea",
    } satisfies Partial<UnsupportedConsensusModeError>);
  });

  it("rejects chains without any configured consensus path", async () => {
    await expect(fetchConsensusProof(137)).rejects.toThrow(
      "No consensus verification path is configured for chain ID 137."
    );
  });
});

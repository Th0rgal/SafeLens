import { describe, it, expect } from "vitest";
import { interpretSafePolicy } from "../safe-policy";
import { interpretTransaction } from "../index";
import type { SafePolicyChangeDetails } from "../types";
import { POLICY_CHANGE_TX } from "../../safe/__tests__/fixtures/policy-change-tx";

describe("interpretSafePolicy", () => {
  describe("changeThreshold", () => {
    it("detects a changeThreshold call", () => {
      const result = interpretSafePolicy(
        POLICY_CHANGE_TX.dataDecoded,
        POLICY_CHANGE_TX.to,
        POLICY_CHANGE_TX.operation,
      );

      expect(result).not.toBeNull();
      expect(result!.protocol).toBe("Safe");
      expect(result!.action).toBe("Policy Change");
    });

    it("produces a summary with the new threshold", () => {
      const result = interpretSafePolicy(
        POLICY_CHANGE_TX.dataDecoded,
        POLICY_CHANGE_TX.to,
        POLICY_CHANGE_TX.operation,
      );

      expect(result!.summary).toBe("Change signing threshold to 2");
    });

    it("includes the correct details", () => {
      const result = interpretSafePolicy(
        POLICY_CHANGE_TX.dataDecoded,
        POLICY_CHANGE_TX.to,
        POLICY_CHANGE_TX.operation,
      );
      const details = result!.details as SafePolicyChangeDetails;

      expect(details.changeType).toBe("changeThreshold");
      expect(details.newThreshold).toBe(2);
      expect(details.safeAddress).toBe(POLICY_CHANGE_TX.to);
    });
  });

  describe("addOwnerWithThreshold", () => {
    const ADD_OWNER_TX = {
      method: "addOwnerWithThreshold",
      parameters: [
        { name: "owner", type: "address", value: "0xd779332c5A52566Dada11A075a735b18DAa6c1f4" },
        { name: "_threshold", type: "uint256", value: "2" },
      ],
    };

    it("detects an addOwnerWithThreshold call", () => {
      const result = interpretSafePolicy(ADD_OWNER_TX, POLICY_CHANGE_TX.to, 0);

      expect(result).not.toBeNull();
      expect(result!.protocol).toBe("Safe");
      expect(result!.action).toBe("Policy Change");
    });

    it("includes the new owner and threshold in details", () => {
      const result = interpretSafePolicy(ADD_OWNER_TX, POLICY_CHANGE_TX.to, 0);
      const details = result!.details as SafePolicyChangeDetails;

      expect(details.changeType).toBe("addOwnerWithThreshold");
      expect(details.newOwner).toBe("0xd779332c5A52566Dada11A075a735b18DAa6c1f4");
      expect(details.newThreshold).toBe(2);
    });

    it("summary mentions the owner and threshold", () => {
      const result = interpretSafePolicy(ADD_OWNER_TX, POLICY_CHANGE_TX.to, 0);
      expect(result!.summary).toContain("Add owner");
      expect(result!.summary).toContain("threshold to 2");
    });
  });

  describe("removeOwner", () => {
    const REMOVE_OWNER_TX = {
      method: "removeOwner",
      parameters: [
        { name: "prevOwner", type: "address", value: "0x0000000000000000000000000000000000000001" },
        { name: "owner", type: "address", value: "0xd779332c5A52566Dada11A075a735b18DAa6c1f4" },
        { name: "_threshold", type: "uint256", value: "1" },
      ],
    };

    it("detects a removeOwner call", () => {
      const result = interpretSafePolicy(REMOVE_OWNER_TX, POLICY_CHANGE_TX.to, 0);
      expect(result).not.toBeNull();
      expect(result!.protocol).toBe("Safe");
    });

    it("includes the removed owner and new threshold", () => {
      const result = interpretSafePolicy(REMOVE_OWNER_TX, POLICY_CHANGE_TX.to, 0);
      const details = result!.details as SafePolicyChangeDetails;

      expect(details.changeType).toBe("removeOwner");
      expect(details.removedOwner).toBe("0xd779332c5A52566Dada11A075a735b18DAa6c1f4");
      expect(details.newThreshold).toBe(1);
    });
  });

  describe("swapOwner", () => {
    const SWAP_OWNER_TX = {
      method: "swapOwner",
      parameters: [
        { name: "prevOwner", type: "address", value: "0x0000000000000000000000000000000000000001" },
        { name: "oldOwner", type: "address", value: "0xd779332c5A52566Dada11A075a735b18DAa6c1f4" },
        { name: "newOwner", type: "address", value: "0x9fC3dc011b461664c835F2527fffb1169b3C213e" },
      ],
    };

    it("detects a swapOwner call", () => {
      const result = interpretSafePolicy(SWAP_OWNER_TX, POLICY_CHANGE_TX.to, 0);
      expect(result).not.toBeNull();
      expect(result!.protocol).toBe("Safe");
    });

    it("includes old and new owner in details", () => {
      const result = interpretSafePolicy(SWAP_OWNER_TX, POLICY_CHANGE_TX.to, 0);
      const details = result!.details as SafePolicyChangeDetails;

      expect(details.changeType).toBe("swapOwner");
      expect(details.removedOwner).toBe("0xd779332c5A52566Dada11A075a735b18DAa6c1f4");
      expect(details.newOwner).toBe("0x9fC3dc011b461664c835F2527fffb1169b3C213e");
    });

    it("summary mentions replace", () => {
      const result = interpretSafePolicy(SWAP_OWNER_TX, POLICY_CHANGE_TX.to, 0);
      expect(result!.summary).toContain("Replace owner");
    });
  });

  describe("edge cases", () => {
    it("returns null for delegatecall operations", () => {
      const result = interpretSafePolicy(
        POLICY_CHANGE_TX.dataDecoded,
        POLICY_CHANGE_TX.to,
        1,
      );
      expect(result).toBeNull();
    });

    it("returns null for unknown methods", () => {
      const result = interpretSafePolicy(
        { method: "transfer", parameters: [] },
        POLICY_CHANGE_TX.to,
        0,
      );
      expect(result).toBeNull();
    });

    it("returns null for null dataDecoded", () => {
      const result = interpretSafePolicy(null, POLICY_CHANGE_TX.to, 0);
      expect(result).toBeNull();
    });
  });
});

describe("interpretTransaction routes Safe policy changes", () => {
  it("routes changeThreshold to the Safe policy interpreter", () => {
    const result = interpretTransaction(
      POLICY_CHANGE_TX.dataDecoded,
      POLICY_CHANGE_TX.to,
      POLICY_CHANGE_TX.operation,
    );

    expect(result).not.toBeNull();
    expect(result!.protocol).toBe("Safe");
    expect(result!.action).toBe("Policy Change");
  });
});

import { describe, it, expect } from "vitest";
import { interpretCowSwapPreSign, decodeOrderUid } from "../cowswap-presign";
import { interpretTransaction } from "../index";
import type { CowSwapPreSignDetails } from "../types";

const COW_SETTLEMENT = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";

// Real orderUid from the user's test transaction (Gnosis Chain)
// 32 bytes digest + 20 bytes owner + 4 bytes validTo = 56 bytes
const REAL_ORDER_UID =
  "0x27d54b722db95ef9d41b27f57563ea015479fddd199167ca635fc9ec5048750f676ad4839a3cbb3739000153e4802bf4ce6aef3f69b64d01";

const REAL_DATA = {
  method: "setPreSignature",
  parameters: [
    {
      name: "orderUid",
      type: "bytes",
      value: REAL_ORDER_UID,
    },
    {
      name: "signed",
      type: "bool",
      value: true,
    },
  ],
};

describe("decodeOrderUid", () => {
  it("decodes a valid 56-byte orderUid", () => {
    const result = decodeOrderUid(REAL_ORDER_UID);
    expect(result).not.toBeNull();
    expect(result!.orderDigest).toBe(
      "0x27d54b722db95ef9d41b27f57563ea015479fddd199167ca635fc9ec5048750f",
    );
    expect(result!.owner).toBe("0x676ad4839a3cbb3739000153e4802bf4ce6aef3f");
    expect(result!.validTo).toBe(0x69b64d01); // 1771491585
  });

  it("returns null for too-short input", () => {
    expect(decodeOrderUid("0xabcd")).toBeNull();
  });

  it("returns null for too-long input", () => {
    expect(decodeOrderUid("0x" + "aa".repeat(57))).toBeNull();
  });

  it("handles input without 0x prefix", () => {
    const raw = REAL_ORDER_UID.slice(2);
    const result = decodeOrderUid(raw);
    expect(result).not.toBeNull();
    expect(result!.orderDigest).toBe(
      "0x27d54b722db95ef9d41b27f57563ea015479fddd199167ca635fc9ec5048750f",
    );
  });
});

describe("interpretCowSwapPreSign", () => {
  it("detects a setPreSignature call on the settlement contract", () => {
    const result = interpretCowSwapPreSign(REAL_DATA, COW_SETTLEMENT, 0);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("cowswap-presign");
    expect(result!.protocol).toBe("CoW Protocol");
    expect(result!.action).toBe("Pre-Sign Order");
  });

  it("extracts details from the orderUid", () => {
    const result = interpretCowSwapPreSign(REAL_DATA, COW_SETTLEMENT, 0);
    const details = result!.details as CowSwapPreSignDetails;
    expect(details.orderUid).toBe(REAL_ORDER_UID);
    expect(details.orderDigest).toBe(
      "0x27d54b722db95ef9d41b27f57563ea015479fddd199167ca635fc9ec5048750f",
    );
    expect(details.owner).toBe("0x676ad4839a3cbb3739000153e4802bf4ce6aef3f");
    expect(details.signed).toBe(true);
    expect(details.settlementContract).toBe(COW_SETTLEMENT);
  });

  it("produces a human-readable summary for signing", () => {
    const result = interpretCowSwapPreSign(REAL_DATA, COW_SETTLEMENT, 0);
    expect(result!.summary).toContain("Pre-sign");
    expect(result!.summary).toContain("CoW order");
  });

  it("detects cancellation (signed=false)", () => {
    const cancelData = {
      method: "setPreSignature",
      parameters: [
        { name: "orderUid", type: "bytes", value: REAL_ORDER_UID },
        { name: "signed", type: "bool", value: false },
      ],
    };
    const result = interpretCowSwapPreSign(cancelData, COW_SETTLEMENT, 0);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("Cancel Pre-Sign");
    const details = result!.details as CowSwapPreSignDetails;
    expect(details.signed).toBe(false);
    expect(result!.summary).toContain("Cancel");
  });

  it("handles signed as string 'true'", () => {
    const data = {
      method: "setPreSignature",
      parameters: [
        { name: "orderUid", type: "bytes", value: REAL_ORDER_UID },
        { name: "signed", type: "bool", value: "true" },
      ],
    };
    const result = interpretCowSwapPreSign(data, COW_SETTLEMENT, 0);
    expect(result).not.toBeNull();
    const details = result!.details as CowSwapPreSignDetails;
    expect(details.signed).toBe(true);
  });

  it("sets severity to info", () => {
    const result = interpretCowSwapPreSign(REAL_DATA, COW_SETTLEMENT, 0);
    expect(result!.severity).toBe("info");
  });

  it("includes the validTo formatted date", () => {
    const result = interpretCowSwapPreSign(REAL_DATA, COW_SETTLEMENT, 0);
    const details = result!.details as CowSwapPreSignDetails;
    expect(details.validToFormatted).toContain("UTC");
  });

  describe("edge cases", () => {
    it("returns null for delegatecall operations", () => {
      const result = interpretCowSwapPreSign(REAL_DATA, COW_SETTLEMENT, 1);
      expect(result).toBeNull();
    });

    it("returns null for wrong target address", () => {
      const result = interpretCowSwapPreSign(
        REAL_DATA,
        "0x1234567890abcdef1234567890abcdef12345678",
        0,
      );
      expect(result).toBeNull();
    });

    it("returns null for other methods on the settlement contract", () => {
      const data = {
        method: "settle",
        parameters: [],
      };
      const result = interpretCowSwapPreSign(data, COW_SETTLEMENT, 0);
      expect(result).toBeNull();
    });

    it("returns null for null dataDecoded", () => {
      const result = interpretCowSwapPreSign(null, COW_SETTLEMENT, 0);
      expect(result).toBeNull();
    });

    it("returns null when orderUid is missing", () => {
      const data = {
        method: "setPreSignature",
        parameters: [
          { name: "signed", type: "bool", value: true },
        ],
      };
      const result = interpretCowSwapPreSign(data, COW_SETTLEMENT, 0);
      expect(result).toBeNull();
    });

    it("returns null for invalid orderUid length", () => {
      const data = {
        method: "setPreSignature",
        parameters: [
          { name: "orderUid", type: "bytes", value: "0xabcdef" },
          { name: "signed", type: "bool", value: true },
        ],
      };
      const result = interpretCowSwapPreSign(data, COW_SETTLEMENT, 0);
      expect(result).toBeNull();
    });

    it("is case-insensitive on the settlement address", () => {
      const result = interpretCowSwapPreSign(
        REAL_DATA,
        "0x9008d19f58aabd9ed0d60971565aa8510560ab41",
        0,
      );
      expect(result).not.toBeNull();
    });
  });
});

describe("interpretTransaction routes CoW presign", () => {
  it("routes setPreSignature to the cowswap-presign interpreter", () => {
    const result = interpretTransaction(REAL_DATA, COW_SETTLEMENT, 0);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("cowswap-presign");
    expect(result!.protocol).toBe("CoW Protocol");
  });

  it("respects disabledIds for cowswap-presign", () => {
    const result = interpretTransaction(
      REAL_DATA,
      COW_SETTLEMENT,
      0,
      ["cowswap-presign"],
    );
    expect(result?.id).not.toBe("cowswap-presign");
  });
});

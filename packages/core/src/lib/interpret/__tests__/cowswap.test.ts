import { describe, it, expect } from "vitest";
import { interpretCowSwapTwap, decodeTwapOrderData } from "../cowswap-twap";
import { interpretTransaction } from "../index";
import type { CowSwapTwapDetails } from "../types";
import { COWSWAP_TWAP_TX } from "../../safe/__tests__/fixtures/cowswap-twap-tx";

const TX = COWSWAP_TWAP_TX;

describe("decodeTwapOrderData", () => {
  const ORDER_DATA_HEX =
    "0x000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" +
    "0000000000000000000000006b175474e89094c44da98b954eedeac495271d0f" +
    "0000000000000000000000009fc3dc011b461664c835f2527fffb1169b3c213e" +
    "00000000000000000000000000000000000000000000001696695dbd1cc2aaaa" +
    "00000000000000000000000000000000000000000000c65f6c4fd1b2f727dfd5" +
    "0000000000000000000000000000000000000000000000000000000000000000" +
    "000000000000000000000000000000000000000000000000000000000000000c" +
    "0000000000000000000000000000000000000000000000000000000000000e10" +
    "0000000000000000000000000000000000000000000000000000000000000004" +
    "067b8e35af8061cbb14795fa7844c1f01183c9666376e240cfe16e76b7d13741";

  it("decodes sell token address", () => {
    const order = decodeTwapOrderData(ORDER_DATA_HEX);
    expect(order.sellToken.toLowerCase()).toBe(
      "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
    );
  });

  it("decodes buy token address", () => {
    const order = decodeTwapOrderData(ORDER_DATA_HEX);
    expect(order.buyToken.toLowerCase()).toBe(
      "0x6b175474e89094c44da98b954eedeac495271d0f"
    );
  });

  it("decodes receiver", () => {
    const order = decodeTwapOrderData(ORDER_DATA_HEX);
    expect(order.receiver.toLowerCase()).toBe(
      "0x9fc3dc011b461664c835f2527fffb1169b3c213e"
    );
  });

  it("decodes partSellAmount", () => {
    const order = decodeTwapOrderData(ORDER_DATA_HEX);
    expect(order.partSellAmount).toBe(
      BigInt("0x1696695dbd1cc2aaaa")
    );
  });

  it("decodes minPartLimit", () => {
    const order = decodeTwapOrderData(ORDER_DATA_HEX);
    expect(order.minPartLimit).toBe(
      BigInt("0xc65f6c4fd1b2f727dfd5")
    );
  });

  it("decodes t0 (start time) as 0 (immediate)", () => {
    const order = decodeTwapOrderData(ORDER_DATA_HEX);
    expect(order.t0).toBe(0n);
  });

  it("decodes n (number of parts) as 12", () => {
    const order = decodeTwapOrderData(ORDER_DATA_HEX);
    expect(order.n).toBe(12n);
  });

  it("decodes t (time interval) as 3600 seconds", () => {
    const order = decodeTwapOrderData(ORDER_DATA_HEX);
    expect(order.t).toBe(3600n);
  });

  it("decodes span", () => {
    const order = decodeTwapOrderData(ORDER_DATA_HEX);
    expect(order.span).toBe(4n);
  });

  it("decodes appData as a bytes32 hash", () => {
    const order = decodeTwapOrderData(ORDER_DATA_HEX);
    expect(order.appData).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  it("total sell amount = partSellAmount × n", () => {
    const order = decodeTwapOrderData(ORDER_DATA_HEX);
    const totalSell = order.partSellAmount * order.n;
    // 12 parts, total should be 12x partSellAmount
    expect(totalSell).toBe(order.partSellAmount * 12n);
  });
});

describe("interpretCowSwapTwap", () => {
  it("detects the CowSwap TWAP pattern", () => {
    const result = interpretCowSwapTwap(
      TX.dataDecoded,
      TX.to,
      TX.operation
    );

    expect(result).not.toBeNull();
    expect(result!.protocol).toBe("CoW Swap");
    expect(result!.action).toBe("TWAP Order");
  });

  it("produces a human-readable summary", () => {
    const result = interpretCowSwapTwap(
      TX.dataDecoded,
      TX.to,
      TX.operation
    );

    expect(result!.summary).toContain("TWAP Sell");
    expect(result!.summary).toContain("WETH");
    expect(result!.summary).toContain("DAI");
    expect(result!.summary).toContain("12 parts");
    expect(result!.summary).toContain("12h");
  });

  it("decodes TWAP order details correctly", () => {
    const result = interpretCowSwapTwap(
      TX.dataDecoded,
      TX.to,
      TX.operation
    );
    const details = result!.details as CowSwapTwapDetails;

    expect(details.sellToken.symbol).toBe("WETH");
    expect(details.buyToken.symbol).toBe("DAI");
    expect(details.numberOfParts).toBe(12);
    expect(details.timeBetweenParts).toBe(3600);
    expect(details.timeBetweenPartsFormatted).toBe("1h");
    expect(details.totalDuration).toBe(43200); // 12h in seconds
    expect(details.totalDurationFormatted).toBe("12h");
    expect(details.startTime).toBe(0); // immediate
    expect(details.receiver.toLowerCase()).toBe(TX.safe.toLowerCase());
  });

  it("detects the bundled WETH approval", () => {
    const result = interpretCowSwapTwap(
      TX.dataDecoded,
      TX.to,
      TX.operation
    );
    const details = result!.details as CowSwapTwapDetails;

    expect(details.approval).toBeDefined();
    expect(details.approval!.token.symbol).toBe("WETH");
    expect(details.approval!.amount).toBe("5000000000000000000000");
    expect(details.approval!.spender.toLowerCase()).toBe(
      "0xc92e8bdf79f0507f65a392b0ab4667716bfe0110"
    );
  });

  it("returns null for non-delegatecall transactions", () => {
    const result = interpretCowSwapTwap(TX.dataDecoded, TX.to, 0);
    expect(result).toBeNull();
  });

  it("returns null for non-multiSend transactions", () => {
    const result = interpretCowSwapTwap(
      { method: "transfer", parameters: [] },
      TX.to,
      1
    );
    expect(result).toBeNull();
  });

  it("returns null when no createWithContext call is present", () => {
    const noTwap = {
      method: "multiSend",
      parameters: [
        {
          name: "transactions",
          valueDecoded: [
            {
              operation: 0,
              to: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
              value: "0",
              data: "0x",
              dataDecoded: { method: "transfer", parameters: [] },
            },
          ],
        },
      ],
    };
    const result = interpretCowSwapTwap(noTwap, TX.to, 1);
    expect(result).toBeNull();
  });
});

describe("interpretTransaction (registry)", () => {
  it("routes to CowSwap interpreter for the fixture tx", () => {
    const result = interpretTransaction(
      TX.dataDecoded,
      TX.to,
      TX.operation
    );

    expect(result).not.toBeNull();
    expect(result!.protocol).toBe("CoW Swap");
    expect(result!.action).toBe("TWAP Order");
  });

  it("returns null for unrecognised transactions", () => {
    const result = interpretTransaction(
      { method: "doSomething", parameters: [] },
      "0x0000000000000000000000000000000000000001",
      0
    );
    expect(result).toBeNull();
  });
});

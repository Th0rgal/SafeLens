/**
 * Fixture: Safe policy change: changeThreshold(2)
 *
 * A real transaction from Gnosis Chain where a 1-of-1 Safe
 * changes its signing threshold to 2.
 */
export const POLICY_CHANGE_TX = {
  safe: "0xba260842B007FaB4119C9747D709119DE4257276",
  to: "0xba260842B007FaB4119C9747D709119DE4257276",
  operation: 0,
  dataDecoded: {
    method: "changeThreshold",
    parameters: [
      {
        name: "_threshold",
        type: "uint256",
        value: "2",
      },
    ],
  },
};

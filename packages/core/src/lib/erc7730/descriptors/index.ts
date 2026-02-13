/**
 * Bundled ERC-7730 descriptors.
 *
 * This file imports all bundled descriptor JSON files and exports them
 * as a typed array.
 */

import uniswapV3Router from "./uniswap-v3-router.json";
import lidoSteth from "./lido-steth.json";

/**
 * Built-in ERC-7730 descriptors bundled with SafeLens.
 */
export const bundledDescriptors = [
  uniswapV3Router,
  lidoSteth,
];

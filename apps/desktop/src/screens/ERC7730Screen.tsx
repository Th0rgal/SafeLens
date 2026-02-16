import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bundledDescriptors, type ERC7730Descriptor } from "@safelens/core";

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  100: "Gnosis",
  137: "Polygon",
  42161: "Arbitrum",
  8453: "Base",
};

function chainLabel(chainId: number) {
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`;
}

function getDeployments(d: ERC7730Descriptor) {
  return d.context.contract?.deployments ?? d.context.eip712?.deployments ?? [];
}

export default function ERC7730Screen() {
  const descriptors = bundledDescriptors as unknown as ERC7730Descriptor[];

  return (
    <>
      <h2 className="mb-1 text-xl font-semibold tracking-tight">ERC-7730 Descriptors</h2>
      <p className="mb-6 text-sm text-muted">
        Bundled clear-signing descriptors used to decode and display contract interactions.
      </p>

      <div className="flex flex-col gap-4">
        {descriptors.map((desc, i) => {
          const deployments = getDeployments(desc);
          const methods = Object.keys(desc.display.formats);

          return (
            <Card key={i}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{desc.metadata.owner}</span>
                  {desc.metadata.info?.url && (
                    <span className="text-xs font-normal text-muted">
                      {desc.metadata.info.url}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {deployments.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted">Deployments</p>
                    <div className="flex flex-wrap gap-2">
                      {deployments.map((dep) => (
                        <span
                          key={`${dep.chainId}-${dep.address}`}
                          className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.05] px-2 py-1 font-mono text-xs"
                        >
                          <span className="text-muted">{chainLabel(dep.chainId)}</span>
                          <span>{dep.address.slice(0, 6)}...{dep.address.slice(-4)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {methods.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted">Supported methods</p>
                    <div className="flex flex-wrap gap-1.5">
                      {methods.map((m) => (
                        <span
                          key={m}
                          className="rounded-md bg-white/[0.05] px-2 py-0.5 font-mono text-xs"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}

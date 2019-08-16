import { Contracts } from "@arkecosystem/core-kernel";

export const transformPlugins = (plugins): Contracts.P2P.IPeerPlugins => {
    const result: Contracts.P2P.IPeerPlugins = {};

    for (let [name, options] of Object.entries(plugins) as Array<[string, any]>) {
        if (options.server) {
            options = { enabled: options.enabled, ...options.server };
        }

        const port: number = Number(options.port);
        const enabled: boolean = !!options.enabled;

        if (isNaN(port) || name.includes("core-p2p")) {
            continue;
        }

        result[name] = {
            enabled,
            port,
        };
    }

    return result;
};
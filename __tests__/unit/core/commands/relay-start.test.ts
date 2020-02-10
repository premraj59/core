import { Container } from "@arkecosystem/core-cli";
import { Console } from "@arkecosystem/core-test-framework";
import { resolve } from "path";
import os from "os";

import { Command } from "@packages/core/src/commands/relay-start";

let cli;
let processManager;
beforeEach(() => {
    cli = new Console();
    processManager = cli.app.get(Container.Identifiers.ProcessManager);
});

describe("StartCommand", () => {
    it("should throw if the process does not exist", async () => {
        jest.spyOn(os, "freemem").mockReturnValue(99999999999);
        jest.spyOn(os, "totalmem").mockReturnValue(99999999999);

        const spyStart = jest.spyOn(processManager, "start").mockImplementation(undefined);

        await cli.execute(Command);

        expect(spyStart).toHaveBeenCalledWith(
            {
                args: "relay:run --token=ark --network=testnet --v=0 --env=production",
                env: {
                    CORE_ENV: "production",
                    NODE_ENV: "production",
                },
                name: "ark-relay",
                node_args: undefined,
                script: resolve(__dirname, "../../../../packages/core/bin/run"),
            },
            { "kill-timeout": 30000, "max-restarts": 5, name: "ark-relay" },
        );
    });
});
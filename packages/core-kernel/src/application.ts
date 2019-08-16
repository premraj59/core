import { set } from "dottie";
import envPaths from "env-paths";
import expandHomeDir from "expand-home-dir";
import { existsSync, removeSync, writeFileSync } from "fs-extra";
import camelCase from "lodash/camelCase";
// import logProcessErrors from "log-process-errors";
import { join, resolve } from "path";
import { JsonObject } from "type-fest";
import * as Bootstrappers from "./bootstrap";
import { ConfigFactory, ConfigRepository } from "./config";
import { Container } from "./container";
import { Kernel } from "./contracts";
import * as Contracts from "./contracts";
import { DirectoryNotFound, FailedNetworkDetection } from "./errors";
import { ProviderRepository } from "./repositories";
import { CacheFactory } from "./services/cache";
import { EventDispatcher } from "./services/events";
import { LoggerFactory } from "./services/log";
import { ConsoleLogger } from "./services/log/adapters/console";
import { QueueFactory } from "./services/queue";
import { AbstractServiceProvider } from "./support";

/**
 * @export
 * @class Application
 * @extends {Container}
 * @implements {Kernel.IApplication}
 */
export class Application extends Container implements Kernel.IApplication {
    /**
     * @private
     * @type {ProviderRepository}
     * @memberof Application
     */
    private readonly providers: ProviderRepository = new ProviderRepository(this);

    /**
     * @private
     * @type {boolean}
     * @memberof Application
     */
    private hasBeenBootstrapped: boolean = false;

    /**
     * @private
     * @type {boolean}
     * @memberof Application
     */
    private booted: boolean = false;

    /**
     * @param {JsonObject} config
     * @returns {Promise<void>}
     * @memberof Application
     */
    public async bootstrap(config: JsonObject): Promise<void> {
        this.registerErrorHandler();

        await this.bindConfiguration(config);

        this.registerBindings();

        this.registerNamespace();

        this.registerPaths();

        await this.registerFactories();

        await this.registerServices();

        await this.boot();
    }

    /**
     * @returns {Promise<void>}
     * @memberof Application
     */
    public async boot(): Promise<void> {
        await this.registerServiceProviders();

        this.booted = true;
    }

    /**
     * @returns {Promise<void>}
     * @memberof Application
     */
    public async reboot(): Promise<void> {
        await this.terminate();

        await this.registerServiceProviders();
    }

    /**
     * @returns {Set<AbstractServiceProvider>}
     * @memberof Application
     */
    public getProviders(): Set<AbstractServiceProvider> {
        return this.providers;
    }

    /**
     * @param {AbstractServiceProvider} provider
     * @returns {Promise<void>}
     * @memberof Application
     */
    public async registerProvider(provider: AbstractServiceProvider): Promise<void> {
        await this.providers.register(provider);
    }

    /**
     * @param {AbstractServiceProvider} provider
     * @returns {Promise<void>}
     * @memberof Application
     */
    public async bootProvider(provider: AbstractServiceProvider): Promise<void> {
        await this.providers.boot(provider);
    }

    /**
     * @param {AbstractServiceProvider} provider
     * @param {JsonObject} opts
     * @returns {AbstractServiceProvider}
     * @memberof Application
     */
    public makeProvider(provider: AbstractServiceProvider, opts: JsonObject): AbstractServiceProvider {
        return this.providers.make(provider, opts);
    }

    /**
     * @param {*} listener
     * @returns {*}
     * @memberof Application
     */
    public afterLoadingEnvironment(listener: any): any {
        return this.afterBootstrapping("LoadEnvironmentVariables", listener);
    }

    /**
     * @param {string} bootstrapper
     * @param {*} listener
     * @memberof Application
     */
    public beforeBootstrapping(bootstrapper: string, listener: any): void {
        this.events.listen(`bootstrapping: ${bootstrapper}`, listener);
    }

    /**
     * @param {string} bootstrapper
     * @param {*} listener
     * @memberof Application
     */
    public afterBootstrapping(bootstrapper: string, listener: any): void {
        this.events.listen(`bootstrapped: ${bootstrapper}`, listener);
    }

    /**
     * @template T
     * @param {string} key
     * @param {T} [value]
     * @returns {T}
     * @memberof Application
     */
    public config<T = any>(key: string, value?: T): T {
        if (value) {
            this.resolve("config").set(key, value);
        }

        return this.resolve("config").get(key);
    }

    /**
     * @returns {string}
     * @memberof Application
     */
    public dirPrefix(): string {
        return this.resolve("app.dirPrefix");
    }

    /**
     * @returns {string}
     * @memberof Application
     */
    public namespace(): string {
        return this.resolve("app.namespace");
    }

    /**
     * @returns {string}
     * @memberof Application
     */
    public version(): string {
        return this.resolve("app.version");
    }

    /**
     * @returns {string}
     * @memberof Application
     */
    public token(): string {
        return this.resolve("app.token");
    }

    /**
     * @returns {string}
     * @memberof Application
     */
    public network(): string {
        return this.resolve("app.network");
    }

    /**
     * @param {string} value
     * @memberof Application
     */
    public useNetwork(value: string): void {
        this.bind("app.network", value);
    }

    /**
     * @param {string} [path=""]
     * @returns {string}
     * @memberof Application
     */
    public dataPath(path: string = ""): string {
        return join(this.getPath("data"), path);
    }

    /**
     * @param {string} path
     * @memberof Application
     */
    public useDataPath(path: string): void {
        this.usePath("data", path);
    }

    /**
     * @param {string} [path=""]
     * @returns {string}
     * @memberof Application
     */
    public configPath(path: string = ""): string {
        return join(this.getPath("config"), path);
    }

    /**
     * @param {string} path
     * @memberof Application
     */
    public useConfigPath(path: string): void {
        this.usePath("config", path);
    }

    /**
     * @param {string} [path=""]
     * @returns {string}
     * @memberof Application
     */
    public cachePath(path: string = ""): string {
        return join(this.getPath("cache"), path);
    }

    /**
     * @param {string} path
     * @memberof Application
     */
    public useCachePath(path: string): void {
        this.usePath("cache", path);
    }

    /**
     * @param {string} [path=""]
     * @returns {string}
     * @memberof Application
     */
    public logPath(path: string = ""): string {
        return join(this.getPath("log"), path);
    }

    /**
     * @param {string} path
     * @memberof Application
     */
    public useLogPath(path: string): void {
        this.usePath("log", path);
    }

    /**
     * @param {string} [path=""]
     * @returns {string}
     * @memberof Application
     */
    public tempPath(path: string = ""): string {
        return join(this.getPath("temp"), path);
    }

    /**
     * @param {string} path
     * @memberof Application
     */
    public useTempPath(path: string): void {
        this.usePath("temp", path);
    }

    /**
     * @returns {string}
     * @memberof Application
     */
    public environmentFile(): string {
        return this.configPath(".env");
    }

    /**
     * @returns {string}
     * @memberof Application
     */
    public environment(): string {
        return this.resolve("app.env");
    }

    /**
     * @param {string} value
     * @memberof Application
     */
    public useEnvironment(value: string): void {
        this.bind("app.env", value);
    }

    /**
     * @returns {boolean}
     * @memberof Application
     */
    public isProduction(): boolean {
        return this.environment() === "production" || this.network() === "mainnet";
    }

    /**
     * @returns {boolean}
     * @memberof Application
     */
    public isDevelopment(): boolean {
        return this.environment() === "development" || ["devnet", "testnet"].includes(this.network());
    }

    /**
     * @returns {boolean}
     * @memberof Application
     */
    public runningTests(): boolean {
        return this.environment() === "test" || this.network() === "testnet";
    }

    /**
     * @returns {boolean}
     * @memberof Application
     */
    public isBooted(): boolean {
        return this.booted;
    }

    /**
     * @returns {boolean}
     * @memberof Application
     */
    public isBootstrapped(): boolean {
        return this.hasBeenBootstrapped;
    }

    /**
     * @memberof Application
     */
    public enableMaintenance(): void {
        writeFileSync(this.tempPath("maintenance"), JSON.stringify({ time: +new Date() }));

        this.log.notice("Application is now in maintenance mode.");

        this.events.dispatch("kernel.maintenance", true);
    }

    /**
     * @memberof Application
     */
    public disableMaintenance(): void {
        removeSync(this.tempPath("maintenance"));

        this.log.notice("Application is now live.");

        this.events.dispatch("kernel.maintenance", false);
    }

    /**
     * @returns {boolean}
     * @memberof Application
     */
    public isDownForMaintenance(): boolean {
        return existsSync(this.tempPath("maintenance"));
    }

    /**
     * @param {string} [reason]
     * @param {Error} [error]
     * @returns {Promise<void>}
     * @memberof Application
     */
    public async terminate(reason?: string, error?: Error): Promise<void> {
        this.hasBeenBootstrapped = false;

        await this.disposeServiceProviders();

        // @TODO: log the message
    }

    /**
     * @readonly
     * @type {Contracts.Kernel.ILogger}
     * @memberof Application
     */
    public get log(): Contracts.Kernel.ILogger {
        return this.resolve<Contracts.Kernel.ILogger>("log");
    }

    /**
     * @readonly
     * @type {Contracts.Blockchain.IBlockchain}
     * @memberof Application
     */
    public get blockchain(): Contracts.Blockchain.IBlockchain {
        return this.resolve<Contracts.Blockchain.IBlockchain>("blockchain");
    }

    /**
     * @readonly
     * @type {Contracts.P2P.IPeerService}
     * @memberof Application
     */
    public get p2p(): Contracts.P2P.IPeerService {
        return this.resolve<Contracts.P2P.IPeerService>("p2p");
    }

    /**
     * @readonly
     * @type {Contracts.TransactionPool.IConnection}
     * @memberof Application
     */
    public get transactionPool(): Contracts.TransactionPool.IConnection {
        return this.resolve<Contracts.TransactionPool.IConnection>("transactionPool");
    }

    /**
     * @readonly
     * @type {Contracts.Kernel.IEventDispatcher}
     * @memberof Application
     */
    public get events(): Contracts.Kernel.IEventDispatcher {
        return this.resolve<Contracts.Kernel.IEventDispatcher>("event-dispatcher");
    }

    /**
     * @private
     * @memberof Application
     */
    private registerErrorHandler(): void {
        // @TODO: implement passing in of options and ensure handling of critical exceptions
        // logProcessErrors({ exitOn: [] });
    }

    /**
     * @private
     * @param {JsonObject} config
     * @memberof Application
     */
    private async bindConfiguration(config: JsonObject): Promise<void> {
        // @TODO: pass in what config provider should be used
        this.bind("configLoader", ConfigFactory.make(this, (config.configLoader || "local") as string));
        this.bind("config", new ConfigRepository(config));

        this.resolve("config").set("options", config.options);
    }

    /**
     * @private
     * @memberof Application
     */
    private registerBindings(): void {
        this.bind("app.env", this.config("env"));
        this.bind("app.token", this.config("token"));
        this.bind("app.network", this.config("network"));
        this.bind("app.version", this.config("version"));

        // @TODO: implement a getter/setter that sets vars locally and in the process.env variables
        process.env.CORE_ENV = this.config("env");
        process.env.NODE_ENV = process.env.CORE_ENV;
        process.env.CORE_TOKEN = this.config("token");
        process.env.CORE_NETWORK_NAME = this.config("network");
        process.env.CORE_VERSION = this.config("version");
    }

    /**
     * @private
     * @memberof Application
     */
    private registerNamespace(): void {
        const token = this.token();
        const network = this.network();

        if (!token || !network) {
            throw new FailedNetworkDetection();
        }

        this.bind("app.namespace", `${token}-${network}`);
        this.bind("app.dirPrefix", `${token}/${network}`);
    }

    /**
     * @private
     * @returns {Promise<void>}
     * @memberof Application
     */
    private async registerFactories(): Promise<void> {
        this.bind("factoryLogger", new LoggerFactory(this));
        this.bind("factoryCache", new CacheFactory(this));
        this.bind("factoryQueue", new QueueFactory(this));
    }

    /**
     * @private
     * @returns {Promise<void>}
     * @memberof Application
     */
    private async registerServices(): Promise<void> {
        this.bind("event-dispatcher", new EventDispatcher());
        this.bind("log", await this.resolve("factoryLogger").make(new ConsoleLogger()));
    }

    /**
     * @private
     * @returns {Promise<void>}
     * @memberof Application
     */
    private async registerServiceProviders(): Promise<void> {
        this.hasBeenBootstrapped = true;

        for (const Bootstrapper of Object.values(Bootstrappers)) {
            this.events.dispatch(`bootstrapping: ${Bootstrapper.name}`, this);

            await new Bootstrapper().bootstrap(this);

            this.events.dispatch(`bootstrapped: ${Bootstrapper.name}`, this);
        }
    }

    /**
     * @private
     * @returns {Promise<void>}
     * @memberof Application
     */
    private async disposeServiceProviders(): Promise<void> {
        for (const provider of this.getProviders()) {
            await provider.dispose();
        }
    }

    /**
     * @private
     * @memberof Application
     */
    private registerPaths(): void {
        const paths: Array<[string, string]> = Object.entries(envPaths(this.token(), { suffix: "core" }));

        for (let [type, path] of paths) {
            const processPath: string | null = process.env[`CORE_PATH_${type.toUpperCase()}`];

            if (processPath) {
                path = resolve(expandHomeDir(processPath));
            }

            set(process.env, `CORE_PATH_${type.toUpperCase()}`, path);

            this[camelCase(`use_${type}_path`)](path);

            this.bind(`path.${type}`, path);
        }
    }

    /**
     * @private
     * @param {string} type
     * @returns {string}
     * @memberof Application
     */
    private getPath(type: string): string {
        const path: string = this.resolve<string>(`path.${type}`);

        if (!existsSync(path)) {
            throw new DirectoryNotFound(path);
        }

        return path;
    }

    /**
     * @private
     * @param {string} type
     * @param {string} path
     * @memberof Application
     */
    private usePath(type: string, path: string): void {
        if (!existsSync(path)) {
            throw new DirectoryNotFound(path);
        }

        this.bind(`path.${type}`, path);
    }
}
declare class EnvironmentVariables {
    PORT: number;
    DATABASE_URL: string;
    DEVICE_TOKENS_JSON: string;
    NODE_ENV?: string;
}
export declare function validateEnv(config: Record<string, unknown>): EnvironmentVariables;
export {};

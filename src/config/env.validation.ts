import { plainToInstance } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  validateSync,
} from "class-validator";

class EnvironmentVariables {
  @IsInt()
  @Min(1)
  PORT!: number;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  DEVICE_TOKENS_JSON!: string;

  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  WORKER_BATCH_SIZE?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  WORKER_POLL_INTERVAL_MS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  WORKER_LEASE_TIMEOUT_MS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  WORKER_MAX_RETRIES?: number;

  @IsOptional()
  @IsString()
  WORKER_INSTANCE_ID?: string;

  @IsOptional()
  @IsIn(["true", "false"])
  ENABLE_DEV_PROCESSING_TRIGGER?: string;

  @IsOptional()
  @IsString()
  PROCESSING_DEV_TRIGGER_TOKEN?: string;

  @IsOptional()
  @IsString()
  PARSER_VERSION?: string;

  @IsOptional()
  @IsIn(["true", "false"])
  ENABLE_BACKFILL?: string;

  @IsOptional()
  @IsString()
  BACKFILL_TRIGGER_TOKEN?: string;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  try {
    JSON.parse(validatedConfig.DEVICE_TOKENS_JSON);
  } catch {
    throw new Error(
      'DEVICE_TOKENS_JSON must be a valid JSON object map: {"device_id":"token"}',
    );
  }

  return validatedConfig;
}

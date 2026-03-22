import { plainToInstance } from "class-transformer";
import {
  IsIn,
  IsInt,
  Max,
  IsOptional,
  IsString,
  Min,
  validateSync,
} from "class-validator";

class EnvironmentVariables {
  @IsOptional()
  @IsInt()
  @Min(1)
  PORT?: number;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  DEVICE_TOKENS_JSON!: string;

  @IsString()
  OPENAI_API_KEY!: string;

  @IsOptional()
  @IsString()
  OPENAI_MODEL?: string;

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

  @IsOptional()
  @IsInt()
  @Min(1)
  ENRICHMENT_POLL_INTERVAL_MS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  ENRICHMENT_BATCH_SIZE?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  ENRICHMENT_MAX_ATTEMPTS?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  ENRICHMENT_RETRY_COOLDOWN_MS?: number;

  @IsString()
  GOOGLE_GEOCODING_API_KEY!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  GOOGLE_GEOCODING_DELAY_MS?: number;

  @IsOptional()
  @IsIn(["true", "false"])
  GEO_ENABLED?: string;

  @IsOptional()
  @IsIn(["true", "false"])
  GEO_AUTO_VERIFY_ENABLED?: string;

  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(100)
  GEO_AUTO_VERIFY_MIN_CONFIDENCE?: number;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  @IsOptional()
  @IsString()
  ADMIN_API_TOKEN?: string;

  @IsOptional()
  @IsString()
  RECAPTCHA_SECRET_KEY?: string;

  @IsOptional()
  @IsString()
  VAPID_PUBLIC_KEY?: string;

  @IsOptional()
  @IsString()
  VAPID_PRIVATE_KEY?: string;

  @IsOptional()
  @IsString()
  VAPID_SUBJECT?: string;

  @IsOptional()
  @IsString()
  FCM_PROJECT_ID?: string;

  @IsOptional()
  @IsString()
  FCM_CLIENT_EMAIL?: string;

  @IsOptional()
  @IsString()
  FCM_PRIVATE_KEY?: string;

  @IsOptional()
  @IsString()
  APP_MIN_VERSION?: string;

  @IsOptional()
  @IsString()
  APP_LATEST_VERSION?: string;

  @IsOptional()
  @IsIn(["true", "false"])
  APP_MAINTENANCE_MODE?: string;

  @IsOptional()
  @IsString()
  APP_MAINTENANCE_MESSAGE?: string;

  @IsOptional()
  @IsString()
  APP_FORCE_UPDATE_MESSAGE?: string;

  @IsOptional()
  @IsString()
  APP_PLAY_STORE_URL?: string;

  @IsOptional()
  @IsString()
  APP_APPLE_STORE_URL?: string;

  @IsOptional()
  @IsString()
  APP_ANNOUNCEMENT_TEXT?: string;

  @IsOptional()
  @IsIn(["info", "warning", "success"])
  APP_ANNOUNCEMENT_TYPE?: string;

  @IsOptional()
  @IsString()
  APP_ANNOUNCEMENT_URL?: string;

  @IsOptional()
  @IsString()
  APP_ANNOUNCEMENT_ID?: string;

  @IsOptional()
  @IsIn(["true", "false"])
  APP_ANNOUNCEMENT_DISMISSIBLE?: string;

  @IsOptional()
  @IsString()
  ANDROID_SHA256_FINGERPRINT?: string;

  @IsOptional()
  @IsString()
  APPLE_TEAM_ID?: string;
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

import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AdminModule } from "./admin/admin.module";
import { AppConfigModule } from "./app-config/app-config.module";
import { AuthModule } from "./auth/auth.module";
import { RequestIdMiddleware } from "./common/request-id.middleware";
import { validateEnv } from "./config/env.validation";
import { DatabaseModule } from "./database/database.module";
import { EnrichmentModule } from "./enrichment/enrichment.module";
import { EventsModule } from "./events/events.module";
import { HealthModule } from "./health/health.module";
import { MapModule } from "./map/map.module";
import { ProcessingModule } from "./processing/processing.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { StatsModule } from "./stats/stats.module";
import { WellKnownModule } from "./well-known/well-known.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    AuthModule,
    RealtimeModule,
    AdminModule,
    HealthModule,
    AppConfigModule,
    WellKnownModule,
    EventsModule,
    MapModule,
    StatsModule,
    ProcessingModule,
    EnrichmentModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { Subscription } from "rxjs";
import { Server } from "socket.io";
import { GlobalHttpExceptionFilter } from "./common/http-exception.filter";
import { RealtimePublisher } from "./realtime/realtime.publisher";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const corsOrigin = configService.get<string>("CORS_ORIGIN");
  let allowedOrigins: string[] = [];

  if (corsOrigin) {
    allowedOrigins = corsOrigin
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);

    if (allowedOrigins.length > 0) {
      app.enableCors({ origin: allowedOrigins });
    }
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  const realtimePublisher = app.get(RealtimePublisher);
  const io = new Server(app.getHttpServer(), {
    path: "/socket.io",
    cors: {
      origin: allowedOrigins.length > 0 ? allowedOrigins : "*",
    },
  });

  io.on("connection", (socket) => {
    const expectedToken = configService.get<string>("ADMIN_API_TOKEN")?.trim();
    const rawToken = socket.handshake.auth?.token;
    const token = typeof rawToken === "string" ? rawToken.trim() : "";
    const isAdminClient = Boolean(expectedToken && token && token === expectedToken);

    if (token && !isAdminClient) {
      socket.disconnect(true);
      return;
    }

    if (isAdminClient) {
      void socket.join("admin");
    }

    socket.emit("connected", {
      status: "ok",
      channel: isAdminClient ? "admin-live" : "map-live",
    });
  });

  const realtimeSubscription: Subscription = realtimePublisher.events$.subscribe((event) => {
    io.to("admin").emit("event", event);
    io.emit(event.type, event.payload ?? { id: event.reportId });
  });

  const port = configService.getOrThrow<number>("PORT");
  await app.listen(port, "0.0.0.0");

  app.enableShutdownHooks();
  process.on("SIGINT", () => {
    realtimeSubscription.unsubscribe();
    io.close();
  });
  process.on("SIGTERM", () => {
    realtimeSubscription.unsubscribe();
    io.close();
  });
}

void bootstrap();

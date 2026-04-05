import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  HttpCode,
  HttpStatus,
  Query,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { DeviceAuthGuard } from "../auth/device-auth.guard";
import { RequestWithContext } from "../common/types";
import { CreateViberBatchDto } from "./dto/create-viber-batch.dto";
import { CreateViberEventDto } from "./dto/create-viber-event.dto";
import { MapEventDto } from "./dto/map-event.dto";
import { EventsService } from "./events.service";

@Controller("/api/events")
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post("/viber")
  @HttpCode(200)
  @UseGuards(DeviceAuthGuard)
  async createViberEvent(
    @Body() body: CreateViberEventDto,
    @Req() req: RequestWithContext,
    @Headers("x-radar-force-429") forceRateLimited?: string,
  ): Promise<{ status: string; request_id: string }> {
    if (forceRateLimited === "1") {
      throw new HttpException("Rate limited", HttpStatus.TOO_MANY_REQUESTS);
    }

    return this.eventsService.ingestViberEvent(
      body,
      req.authToken ?? "",
      req.requestId ?? "unknown",
    );
  }

  @Post("/viber-batch")
  @HttpCode(200)
  @UseGuards(DeviceAuthGuard)
  async createViberBatch(
    @Body() body: CreateViberBatchDto,
    @Req() req: RequestWithContext,
  ): Promise<{ status: string; request_id: string; accepted: number }> {
    return this.eventsService.ingestViberBatch(
      body,
      req.authToken ?? "",
      req.requestId ?? "unknown",
    );
  }

  @Get("/map")
  @UseGuards(DeviceAuthGuard)
  async getMapEvents(
    @Req() req: RequestWithContext,
    @Query("since") since?: string,
    @Query("eventType") eventType?: string,
    @Query("geoOnly") geoOnly?: string,
  ): Promise<MapEventDto[]> {
    return this.eventsService.getMapEvents({
      authToken: req.authToken ?? "",
      since,
      eventTypes: eventType,
      geoOnly,
    });
  }
}

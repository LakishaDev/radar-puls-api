import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { MapEventDto } from "../events/dto/map-event.dto";
import { EventsService } from "../events/events.service";
import { CreatePublicReportDto } from "./dto/create-public-report.dto";
import {
  SubscribeMapAlertsDto,
  UnsubscribeMapAlertsDto,
} from "./dto/subscribe-map-alerts.dto";
import { VoteReportDto } from "./dto/vote-report.dto";
import { PublicCaptchaService } from "./public-captcha.service";
import { PublicMapRateLimitGuard } from "./public-map-rate-limit.guard";
import { PublicSubmissionRateLimitGuard } from "./public-submission-rate-limit.guard";
import { PushNotificationsService } from "./push-notifications.service";

@Controller("/api/map")
export class MapController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly captchaService: PublicCaptchaService,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  @Get("/reports")
  @UseGuards(PublicMapRateLimitGuard)
  async getPublicMapReports(
    @Query("since") since?: string,
    @Query("eventType") eventType?: string,
    @Query("geoOnly") geoOnly?: string,
  ): Promise<MapEventDto[]> {
    return this.eventsService.getPublicMapEvents({
      since,
      eventTypes: eventType,
      geoOnly,
    });
  }

  @Post("/reports")
  @UseGuards(PublicSubmissionRateLimitGuard)
  async createPublicReport(
    @Body() body: CreatePublicReportDto,
    @Req() req: Request,
  ): Promise<{ id: string; moderationStatus: string }> {
    const forwardedFor = req.header("x-forwarded-for");
    const clientIp = forwardedFor?.split(",")[0]?.trim() || req.ip || "unknown";

    await this.captchaService.assertHuman(body.recaptchaToken, clientIp);

    return this.eventsService.createPublicReport({
      eventType: body.eventType,
      locationText: body.locationText,
      senderName: body.senderName,
      description: body.description,
      lat: body.lat,
      lng: body.lng,
      clientId: clientIp,
    });
  }

  @Post("/reports/:id/vote")
  @UseGuards(PublicMapRateLimitGuard)
  async voteForReport(
    @Param("id") reportId: string,
    @Body() body: VoteReportDto,
    @Req() req: Request,
  ): Promise<{ id: string; upvotes: number; downvotes: number }> {
    const forwardedFor = req.header("x-forwarded-for");
    const clientIp = forwardedFor?.split(",")[0]?.trim() || req.ip || "unknown";

    return this.eventsService.voteForReport({
      reportId,
      vote: body.vote,
      clientId: `${clientIp}:${reportId}`,
    });
  }

  @Post("/subscriptions")
  @UseGuards(PublicMapRateLimitGuard)
  async subscribeToMapAlerts(
    @Body() body: SubscribeMapAlertsDto,
    @Req() req: Request,
  ): Promise<{ status: "subscribed" }> {
    const forwardedFor = req.header("x-forwarded-for");
    const clientIp = forwardedFor?.split(",")[0]?.trim() || req.ip || "unknown";

    return this.pushNotificationsService.subscribe(body, clientIp);
  }

  @Delete("/subscriptions")
  @UseGuards(PublicMapRateLimitGuard)
  async unsubscribeFromMapAlerts(
    @Body() body: UnsubscribeMapAlertsDto,
  ): Promise<{ status: "unsubscribed" }> {
    return this.pushNotificationsService.unsubscribe(body.endpoint);
  }
}

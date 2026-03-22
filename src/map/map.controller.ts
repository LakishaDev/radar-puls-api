import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
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
  RegisterMobilePushDto,
  UnregisterMobilePushDto,
} from "./dto/register-mobile-push.dto";
import {
  SubscribeMapAlertsDto,
  UnsubscribeMapAlertsDto,
} from "./dto/subscribe-map-alerts.dto";
import { MobilePushService } from "./mobile-push.service";
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
    private readonly mobilePushService: MobilePushService,
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

  @Get("/reports/:id")
  @UseGuards(PublicMapRateLimitGuard)
  async getPublicMapReportById(@Param("id") id: string): Promise<MapEventDto> {
    if (!this.isValidUuid(id)) {
      throw new BadRequestException("Invalid report ID format");
    }

    const report = await this.eventsService.getPublicReportById(id);

    if (!report) {
      throw new NotFoundException("Report not found");
    }

    return report;
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

  @Post("/mobile/register-device")
  @UseGuards(PublicMapRateLimitGuard)
  async registerMobileDevice(
    @Body() body: RegisterMobilePushDto,
  ): Promise<{ status: "registered" }> {
    return this.mobilePushService.registerToken(body);
  }

  @Delete("/mobile/register-device")
  @UseGuards(PublicMapRateLimitGuard)
  async unregisterMobileDevice(
    @Body() body: UnregisterMobilePushDto,
  ): Promise<{ status: "unregistered" }> {
    return this.mobilePushService.unregisterToken(body.fcmToken);
  }

  private isValidUuid(value: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }
}

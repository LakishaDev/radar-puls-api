import {
  Body,
  Controller,
  Headers,
  HttpException,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { DeviceAuthGuard } from "../auth/device-auth.guard";
import { RequestWithContext } from "../common/types";
import { CreateViberEventDto } from "./dto/create-viber-event.dto";
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
}

import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppLogger } from "../common/app.logger";

type RecaptchaVerifyResponse = {
  success?: boolean;
  score?: number;
};

@Injectable()
export class PublicCaptchaService {
  private readonly secretKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.secretKey = this.configService.get<string>("RECAPTCHA_SECRET_KEY")?.trim() ?? "";
  }

  async assertHuman(token: string | undefined, clientIp: string): Promise<void> {
    if (!this.secretKey) {
      return;
    }

    if (!token || token.trim().length === 0) {
      throw new BadRequestException("recaptchaToken is required");
    }

    const params = new URLSearchParams({
      secret: this.secretKey,
      response: token.trim(),
      remoteip: clientIp,
    });

    let response: Response;
    try {
      response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });
    } catch (error) {
      this.logger.error("recaptcha_request_failed", {
        error: error instanceof Error ? error.message : "unknown recaptcha error",
      });
      throw new ServiceUnavailableException("Captcha verification unavailable");
    }

    if (!response.ok) {
      throw new ServiceUnavailableException("Captcha verification unavailable");
    }

    const payload = (await response.json()) as RecaptchaVerifyResponse;
    if (!payload.success) {
      throw new BadRequestException("Captcha verification failed");
    }

    if (typeof payload.score === "number" && payload.score < 0.5) {
      throw new BadRequestException("Captcha score too low");
    }
  }
}

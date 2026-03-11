import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { RequestWithContext } from "../common/types";

@Injectable()
export class DeviceAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const auth = request.header("authorization");

    if (!auth || !auth.startsWith("Bearer ")) {
      throw new UnauthorizedException();
    }

    const token = auth.slice("Bearer ".length).trim();
    if (!token) {
      throw new UnauthorizedException();
    }

    request.authToken = token;
    return true;
  }
}

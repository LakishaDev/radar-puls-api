import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { GlobalHttpExceptionFilter } from "../src/common/http-exception.filter";
import { AdminAuthGuard } from "../src/auth/admin-auth.guard";
import { AdminGeocodingCacheController } from "../src/admin/admin-geocoding-cache.controller";
import { AdminGeocodingCacheService } from "../src/admin/admin-geocoding-cache.service";

describe("Admin geocoding cache query (e2e)", () => {
  let app: INestApplication;

  const serviceMock = {
    list: jest.fn(),
    getById: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const configServiceMock = {
    get: jest.fn((key: string) => {
      if (key === "ADMIN_API_TOKEN") {
        return "dev-admin-token";
      }
      return undefined;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminGeocodingCacheController],
      providers: [
        {
          provide: AdminGeocodingCacheService,
          useValue: serviceMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new GlobalHttpExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it.each([
    ["hitCount", "hit_count"],
    ["createdAt", "created_at"],
    ["updatedAt", "updated_at"],
    ["locationText", "location_text"],
  ])(
    "accepts sortBy alias %s and normalizes it to %s",
    async (alias: string, normalized: string) => {
    serviceMock.list.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      limit: 5,
    });

    await request(app.getHttpServer())
      .get("/api/admin/geocoding-cache")
      .query({ sortBy: alias, sortOrder: "DESC", page: 1, limit: 5 })
      .set("Authorization", "Bearer dev-admin-token")
      .expect(200);

    expect(serviceMock.list).toHaveBeenCalledTimes(1);
    expect(serviceMock.list).toHaveBeenCalledWith(
      expect.objectContaining({
        sortBy: normalized,
        sortOrder: "desc",
        page: 1,
        limit: 5,
      }),
    );
    },
  );

  it("rejects unsupported sortBy", async () => {
    await request(app.getHttpServer())
      .get("/api/admin/geocoding-cache")
      .query({ sortBy: "not-valid", sortOrder: "desc" })
      .set("Authorization", "Bearer dev-admin-token")
      .expect(400);

    expect(serviceMock.list).not.toHaveBeenCalled();
  });
});
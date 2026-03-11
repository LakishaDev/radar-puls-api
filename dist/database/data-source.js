"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppDataSource = void 0;
require("reflect-metadata");
const typeorm_1 = require("typeorm");
const raw_event_entity_1 = require("./raw-event.entity");
exports.AppDataSource = new typeorm_1.DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [raw_event_entity_1.RawEventEntity],
    migrations: ['src/database/migrations/*.ts', 'dist/database/migrations/*.js'],
    synchronize: false,
});
//# sourceMappingURL=data-source.js.map
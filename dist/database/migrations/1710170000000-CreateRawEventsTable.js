"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateRawEventsTable1710170000000 = void 0;
class CreateRawEventsTable1710170000000 {
    constructor() {
        this.name = 'CreateRawEventsTable1710170000000';
    }
    async up(queryRunner) {
        await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS raw_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        source text NOT NULL,
        group_name text NOT NULL,
        raw_message text NOT NULL,
        event_timestamp timestamptz NOT NULL,
        received_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        device_id text NOT NULL,
        processing_status text NOT NULL DEFAULT 'pending'
      );
    `);
        await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_raw_events_created_at ON raw_events (created_at);');
        await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_raw_events_processing_status ON raw_events (processing_status);');
        await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_raw_events_device_id ON raw_events (device_id);');
    }
    async down(queryRunner) {
        await queryRunner.query('DROP TABLE IF EXISTS raw_events;');
    }
}
exports.CreateRawEventsTable1710170000000 = CreateRawEventsTable1710170000000;
//# sourceMappingURL=1710170000000-CreateRawEventsTable.js.map
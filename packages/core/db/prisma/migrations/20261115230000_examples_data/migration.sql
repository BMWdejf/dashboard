-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "examples_data" (
    "id" SERIAL NOT NULL,
    "section" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "value" DECIMAL(14,2) NOT NULL,
    "value2" DECIMAL(14,2),
    "change_pct" DECIMAL(6,2),
    "status" TEXT,
    "occurred_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "examples_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "examples_data_section_position_idx" ON "examples_data"("section", "position");

